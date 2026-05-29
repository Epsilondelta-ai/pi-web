package auth

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

type OAuthProvidersResponse struct {
	Providers []OAuthProviderStatus `json:"providers"`
}

type OAuthProviderStatus struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Configured bool   `json:"configured"`
}

type StartOAuthRequest struct {
	Provider string `json:"provider"`
}

type OAuthInputRequest struct {
	Value string `json:"value"`
}

type OAuthSessionResponse struct {
	ID           string               `json:"id"`
	Provider     string               `json:"provider"`
	Status       string               `json:"status"`
	AuthURL      string               `json:"authUrl,omitempty"`
	Instructions string               `json:"instructions,omitempty"`
	Prompt       *OAuthPrompt         `json:"prompt,omitempty"`
	Progress     []string             `json:"progress"`
	Error        string               `json:"error,omitempty"`
	ProviderInfo *OAuthProviderStatus `json:"providerInfo,omitempty"`
}

type OAuthPrompt struct {
	Kind        string `json:"kind"`
	Message     string `json:"message"`
	Placeholder string `json:"placeholder,omitempty"`
}

type oauthSession struct {
	id           string
	provider     string
	status       string
	authURL      string
	instructions string
	prompt       *OAuthPrompt
	progress     []string
	err          string
	providerInfo *OAuthProviderStatus
	stdin        *bufio.Writer
	cancel       context.CancelFunc
	updated      time.Time
}

type oauthManager struct {
	mu       sync.Mutex
	sessions map[string]*oauthSession
}

var defaultOAuthManager = &oauthManager{sessions: map[string]*oauthSession{}}

func OAuthProviders() (OAuthProvidersResponse, error) {
	providers, err := runOAuthListHelper()
	if err != nil {
		return OAuthProvidersResponse{}, err
	}
	path, err := authPath()
	if err != nil {
		return OAuthProvidersResponse{}, err
	}
	stored, err := readAuthFile(path)
	if err != nil {
		return OAuthProvidersResponse{}, err
	}
	for index := range providers {
		_, providers[index].Configured = stored[providers[index].ID]
	}
	return OAuthProvidersResponse{Providers: providers}, nil
}

func StartOAuthLogin(req StartOAuthRequest) (OAuthSessionResponse, error) {
	return defaultOAuthManager.start(req.Provider)
}

func OAuthLoginSession(id string) (OAuthSessionResponse, error) {
	return defaultOAuthManager.get(id)
}

func SendOAuthLoginInput(id string, req OAuthInputRequest) (OAuthSessionResponse, error) {
	return defaultOAuthManager.input(id, req.Value)
}

func (m *oauthManager) start(provider string) (OAuthSessionResponse, error) {
	if provider == "" {
		return OAuthSessionResponse{}, errors.New("provider is required")
	}
	if existing, ok := m.activeSessionForProvider(provider); ok {
		return existing, nil
	}
	sessionID, err := randomSessionID()
	if err != nil {
		return OAuthSessionResponse{}, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	cmd, stdin, stdout, err := oauthLoginCommand(ctx, provider)
	if err != nil {
		cancel()
		return OAuthSessionResponse{}, err
	}
	session := &oauthSession{id: sessionID, provider: provider, status: "starting", stdin: stdin, cancel: cancel, updated: time.Now()}
	m.mu.Lock()
	if existing := m.activeSessionForProviderLocked(provider); existing != nil {
		m.mu.Unlock()
		cancel()
		return existing.response(), nil
	}
	m.sessions[sessionID] = session
	m.mu.Unlock()
	if err := cmd.Start(); err != nil {
		cancel()
		return OAuthSessionResponse{}, err
	}
	go m.consume(sessionID, stdout, cmd)
	return session.response(), nil
}

func (m *oauthManager) activeSessionForProvider(provider string) (OAuthSessionResponse, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	session := m.activeSessionForProviderLocked(provider)
	if session == nil {
		return OAuthSessionResponse{}, false
	}
	return session.response(), true
}

func (m *oauthManager) activeSessionForProviderLocked(provider string) *oauthSession {
	for _, session := range m.sessions {
		if session.provider == provider && isActiveOAuthStatus(session.status) {
			return session
		}
	}
	return nil
}

func isActiveOAuthStatus(status string) bool {
	return status == "starting" || status == "running" || status == "waiting"
}

func (m *oauthManager) get(id string) (OAuthSessionResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	session := m.sessions[id]
	if session == nil {
		return OAuthSessionResponse{}, errors.New("OAuth session not found")
	}
	return session.response(), nil
}

func (m *oauthManager) input(id string, value string) (OAuthSessionResponse, error) {
	m.mu.Lock()
	session := m.sessions[id]
	if session == nil {
		m.mu.Unlock()
		return OAuthSessionResponse{}, errors.New("OAuth session not found")
	}
	stdin := session.stdin
	m.mu.Unlock()
	if stdin == nil {
		return OAuthSessionResponse{}, errors.New("OAuth session is not accepting input")
	}
	payload, _ := json.Marshal(map[string]string{"type": "input", "value": value})
	if _, err := stdin.Write(append(payload, '\n')); err != nil {
		return OAuthSessionResponse{}, err
	}
	if err := stdin.Flush(); err != nil {
		return OAuthSessionResponse{}, err
	}
	return m.get(id)
}

func (m *oauthManager) consume(id string, stdout *bufio.Scanner, cmd *exec.Cmd) {
	for stdout.Scan() {
		var event map[string]any
		if err := json.Unmarshal(stdout.Bytes(), &event); err != nil {
			continue
		}
		m.apply(id, event)
	}
	if err := cmd.Wait(); err != nil {
		m.failIfActive(id, err.Error())
		return
	}
	m.completeIfActive(id)
}

func (m *oauthManager) apply(id string, event map[string]any) {
	m.mu.Lock()
	defer m.mu.Unlock()
	session := m.sessions[id]
	if session == nil {
		return
	}
	session.updated = time.Now()
	session.prompt = nil
	switch event["type"] {
	case "started":
		session.status = "running"
		session.providerInfo = providerInfoFromEvent(event["provider"])
	case "auth":
		session.status = "waiting"
		session.authURL, _ = event["url"].(string)
		session.instructions, _ = event["instructions"].(string)
	case "prompt", "manualCode":
		session.status = "waiting"
		session.prompt = promptFromEvent(event)
	case "progress":
		message, _ := event["message"].(string)
		if message != "" {
			session.progress = append(session.progress, message)
		}
		session.status = "running"
	case "success":
		session.status = "success"
		session.providerInfo = providerInfoFromEvent(event["provider"])
	case "error":
		session.status = "error"
		session.err, _ = event["message"].(string)
	}
}

func (m *oauthManager) failIfActive(id string, message string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	session := m.sessions[id]
	if session == nil || session.status == "success" || session.status == "error" {
		return
	}
	session.status = "error"
	session.err = message
}

func (m *oauthManager) completeIfActive(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	session := m.sessions[id]
	if session == nil || session.status == "success" || session.status == "error" {
		return
	}
	session.status = "success"
}

func (s *oauthSession) response() OAuthSessionResponse {
	return OAuthSessionResponse{
		ID:           s.id,
		Provider:     s.provider,
		Status:       s.status,
		AuthURL:      s.authURL,
		Instructions: s.instructions,
		Prompt:       s.prompt,
		Progress:     append([]string{}, s.progress...),
		Error:        s.err,
		ProviderInfo: s.providerInfo,
	}
}

func oauthLoginCommand(ctx context.Context, provider string) (*exec.Cmd, *bufio.Writer, *bufio.Scanner, error) {
	authPath, err := authPath()
	if err != nil {
		return nil, nil, nil, err
	}
	oauthIndex, err := piAIOAuthIndexPath()
	if err != nil {
		return nil, nil, nil, err
	}
	cmd := exec.CommandContext(ctx, "node", "--input-type=module", "-e", oauthHelperScript, provider)
	cmd.Env = append(os.Environ(), "PI_AUTH_PATH="+authPath, "PI_AI_OAUTH_INDEX="+oauthIndex)
	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		return nil, nil, nil, err
	}
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return nil, nil, nil, err
	}
	cmd.Stderr = os.Stderr
	return cmd, bufio.NewWriter(stdinPipe), bufio.NewScanner(stdoutPipe), nil
}

func runOAuthListHelper() ([]OAuthProviderStatus, error) {
	oauthIndex, err := piAIOAuthIndexPath()
	if err != nil {
		return nil, err
	}
	script := `import { pathToFileURL } from 'node:url'; const m = await import(pathToFileURL(process.env.PI_AI_OAUTH_INDEX).href); console.log(JSON.stringify(m.getOAuthProviders().map((p) => ({ id: p.id, name: p.name }))));`
	cmd := exec.Command("node", "--input-type=module", "-e", script)
	cmd.Env = append(os.Environ(), "PI_AI_OAUTH_INDEX="+oauthIndex)
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var providers []OAuthProviderStatus
	if err := json.Unmarshal(out, &providers); err != nil {
		return nil, err
	}
	return providers, nil
}

func piAIOAuthIndexPath() (string, error) {
	candidates := []string{
		filepath.Join(os.Getenv("HOME"), ".npm-global", "lib", "node_modules", "@earendil-works", "pi-coding-agent", "node_modules", "@earendil-works", "pi-ai", "dist", "utils", "oauth", "index.js"),
		"/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/utils/oauth/index.js",
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}
	return "", errors.New("pi-ai OAuth module not found; install pi CLI first")
}

func randomSessionID() (string, error) {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(data[:]), nil
}

func providerInfoFromEvent(value any) *OAuthProviderStatus {
	data, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	id, _ := data["id"].(string)
	name, _ := data["name"].(string)
	return &OAuthProviderStatus{ID: id, Name: name, Configured: true}
}

func promptFromEvent(event map[string]any) *OAuthPrompt {
	kind, _ := event["type"].(string)
	prompt := OAuthPrompt{Kind: kind}
	if data, ok := event["prompt"].(map[string]any); ok {
		prompt.Message, _ = data["message"].(string)
		prompt.Placeholder, _ = data["placeholder"].(string)
	} else {
		prompt.Message, _ = event["prompt"].(string)
	}
	return &prompt
}
