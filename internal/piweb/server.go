package piweb

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

type Config struct {
	Host              string
	Port              string
	AllowedOrigins    []string
	EnablePiExecution bool
	StaticFiles       fs.FS
	CurrentVersion    string
	VersionStatus     func(context.Context, string) (VersionStatus, error)
	PiVersionStatus   func(context.Context) (PiVersionStatus, error)
}

type Server struct {
	store        *Store
	broker       *Broker
	runner       *Runner
	mux          *http.ServeMux
	config       Config
	commandCache commandCache
}

type commandCache struct {
	mu      sync.Mutex
	entries map[string]commandCacheEntry
}

type commandCacheEntry struct {
	result nativeCommandResult
	loaded time.Time
}

func NewServer(config Config, store *Store, broker *Broker) *Server {
	if config.Host == "" {
		config.Host = "127.0.0.1"
	}
	if config.Port == "" {
		config.Port = "8732"
	}
	if len(config.AllowedOrigins) == 0 {
		config.AllowedOrigins = []string{
			"http://localhost:4321",
			"http://127.0.0.1:4321",
			"http://localhost:6006",
			"http://127.0.0.1:6006",
		}
	}
	if config.CurrentVersion == "" {
		config.CurrentVersion = "dev"
	}
	s := &Server{
		store:        store,
		broker:       broker,
		runner:       NewRunner(),
		mux:          http.NewServeMux(),
		config:       config,
		commandCache: commandCache{entries: map[string]commandCacheEntry{}},
	}
	s.routes()
	return s
}

func (s *Server) Addr() string {
	return s.config.Host + ":" + s.config.Port
}
func (s *Server) Handler() http.Handler {
	return s.withLogging(s.withCORS(s.mux))
}
func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/health", s.health)
	s.mux.HandleFunc("GET /api/version", s.versionStatus)
	s.mux.HandleFunc("GET /api/pi/version", s.piVersionStatus)
	s.mux.HandleFunc("GET /api/auth/providers", s.authProviders)
	s.mux.HandleFunc("GET /api/auth/oauth/providers", s.oauthProviders)
	s.mux.HandleFunc("POST /api/auth/oauth/start", s.startOAuthLogin)
	s.mux.HandleFunc("GET /api/auth/oauth/sessions/{sessionID}", s.oauthLoginSession)
	s.mux.HandleFunc("POST /api/auth/oauth/sessions/{sessionID}/input", s.oauthLoginInput)
	s.mux.HandleFunc("POST /api/auth/api-key", s.saveAPIKey)
	s.mux.HandleFunc("DELETE /api/auth/{provider}", s.logoutProvider)
	s.mux.HandleFunc("GET /api/system/folders", s.listFolders)
	s.mux.HandleFunc("GET /api/workspaces", s.workspaces)
	s.mux.HandleFunc("POST /api/workspaces/open", s.openWorkspace)
	s.mux.HandleFunc("POST /api/workspaces/clone", s.cloneWorkspace)
	s.mux.HandleFunc("DELETE /api/workspaces/{workspaceID}", s.deleteWorkspace)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/sessions", s.workspaceSessions)
	s.mux.HandleFunc("POST /api/workspaces/{workspaceID}/sessions", s.createSession)
	s.mux.HandleFunc("DELETE /api/workspaces/{workspaceID}/sessions", s.deleteWorkspaceSessions)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/files", s.workspaceFiles)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/files/search", s.searchWorkspaceFiles)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/commands", s.workspaceCommands)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/models", s.workspaceModels)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/runtime-status", s.workspaceRuntimeStatus)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/runtime-model", s.workspaceRuntimeModel)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/runtime-quota", s.workspaceRuntimeQuota)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/settings", s.workspaceSettings)
	s.mux.HandleFunc("PUT /api/workspaces/{workspaceID}/settings", s.saveWorkspaceSettings)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/files/read", s.readWorkspaceFile)
	s.mux.HandleFunc("PUT /api/workspaces/{workspaceID}/files/write", s.writeWorkspaceFile)
	s.mux.HandleFunc("POST /api/workspaces/{workspaceID}/files/create", s.createWorkspaceFile)
	s.mux.HandleFunc("PATCH /api/workspaces/{workspaceID}/files/rename", s.renameWorkspaceFile)
	s.mux.HandleFunc("DELETE /api/workspaces/{workspaceID}/files/delete", s.deleteWorkspaceFile)
	s.mux.HandleFunc("POST /api/workspaces/{workspaceID}/files/upload", s.uploadWorkspaceFile)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/git/status", s.gitStatus)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/git/history", s.gitHistory)
	s.mux.HandleFunc("GET /api/workspaces/{workspaceID}/git/commit", s.gitCommit)
	s.mux.HandleFunc("POST /api/workspaces/{workspaceID}/shell", s.shellCommand)
	s.mux.HandleFunc("GET /api/sessions/{sessionID}", s.session)
	s.mux.HandleFunc("PATCH /api/sessions/{sessionID}", s.renameSession)
	s.mux.HandleFunc("DELETE /api/sessions/{sessionID}", s.deleteSession)
	s.mux.HandleFunc("POST /api/sessions/{sessionID}/prompt", s.prompt)
	s.mux.HandleFunc("POST /api/sessions/{sessionID}/ag-ui", s.aguiSessionRun)
	s.mux.HandleFunc("POST /api/sessions/{sessionID}/steer", s.steerSession)
	s.mux.HandleFunc("POST /api/sessions/{sessionID}/cancel", s.cancelSession)
	s.mux.HandleFunc("GET /api/sessions/{sessionID}/events", s.sessionEvents)
	if s.config.StaticFiles != nil {
		s.mux.HandleFunc("GET /", s.staticFile)
	}
}
func (s *Server) context() context.Context {
	return context.Background()
}
func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Last-Event-ID")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
func (s *Server) withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("request", "method", r.Method, "path", r.URL.Path, "duration", time.Since(start).String())
	})
}
func (s *Server) authProviders(w http.ResponseWriter, _ *http.Request) {
	providers, err := AuthProviders()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, providers)
}

func (s *Server) oauthProviders(w http.ResponseWriter, _ *http.Request) {
	providers, err := OAuthProviders()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, providers)
}

func (s *Server) startOAuthLogin(w http.ResponseWriter, r *http.Request) {
	var req StartOAuthRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	session, err := StartOAuthLogin(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": session})
}

func (s *Server) oauthLoginSession(w http.ResponseWriter, r *http.Request) {
	session, err := OAuthLoginSession(r.PathValue("sessionID"))
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": session})
}

func (s *Server) oauthLoginInput(w http.ResponseWriter, r *http.Request) {
	var req OAuthInputRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	session, err := SendOAuthLoginInput(r.PathValue("sessionID"), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": session})
}

func (s *Server) saveAPIKey(w http.ResponseWriter, r *http.Request) {
	var req SaveAPIKeyRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	provider, err := SaveAPIKey(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"provider": provider})
}

func (s *Server) logoutProvider(w http.ResponseWriter, r *http.Request) {
	provider := r.PathValue("provider")
	if err := LogoutProvider(provider); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"provider": provider, "configured": false})
}

const maxJSONBodyBytes int64 = 16 << 20

var errRequestBodyTooLarge = errors.New("request body is too large")

type limitedJSONReader struct {
	reader io.Reader
	read   int64
}

func (r *limitedJSONReader) Read(p []byte) (int, error) {
	remaining := maxJSONBodyBytes + 1 - r.read
	if remaining <= 0 {
		return 0, errRequestBodyTooLarge
	}
	if int64(len(p)) > remaining {
		p = p[:remaining]
	}
	n, err := r.reader.Read(p)
	r.read += int64(n)
	return n, err
}

func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	limited := &limitedJSONReader{reader: r.Body}
	decoder := json.NewDecoder(limited)
	if err := decoder.Decode(v); err != nil {
		if limited.read > maxJSONBodyBytes {
			return errRequestBodyTooLarge
		}
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if limited.read > maxJSONBodyBytes {
			return errRequestBodyTooLarge
		}
		if err == nil {
			return errors.New("request body must contain only one JSON value")
		}
		return err
	}
	if limited.read > maxJSONBodyBytes {
		return errRequestBodyTooLarge
	}
	return nil
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, status int, err error) {
	if errors.Is(err, errRequestBodyTooLarge) {
		status = http.StatusRequestEntityTooLarge
	}
	writeJSON(w, status, ErrorResponse{Error: err.Error()})
}
func writeStoreError(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeError(w, http.StatusInternalServerError, err)
}
