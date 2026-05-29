package auth

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
)

type AuthProvidersResponse struct {
	Providers []AuthProviderStatus `json:"providers"`
	Path      string               `json:"path"`
}

type AuthProviderStatus struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Configured bool   `json:"configured"`
	Source     string `json:"source,omitempty"`
}

type SaveAPIKeyRequest struct {
	Provider string `json:"provider"`
	APIKey   string `json:"apiKey"`
}

var apiKeyAuthProviders = []AuthProviderStatus{
	{ID: "anthropic", Name: "Anthropic"},
	{ID: "openai", Name: "OpenAI"},
	{ID: "azure-openai-responses", Name: "Azure OpenAI Responses"},
	{ID: "deepseek", Name: "DeepSeek"},
	{ID: "google", Name: "Google Gemini"},
	{ID: "google-vertex", Name: "Google Vertex AI"},
	{ID: "amazon-bedrock", Name: "Amazon Bedrock"},
	{ID: "mistral", Name: "Mistral"},
	{ID: "groq", Name: "Groq"},
	{ID: "cerebras", Name: "Cerebras"},
	{ID: "cloudflare-ai-gateway", Name: "Cloudflare AI Gateway"},
	{ID: "cloudflare-workers-ai", Name: "Cloudflare Workers AI"},
	{ID: "xai", Name: "xAI"},
	{ID: "openrouter", Name: "OpenRouter"},
	{ID: "vercel-ai-gateway", Name: "Vercel AI Gateway"},
	{ID: "zai", Name: "ZAI"},
	{ID: "opencode", Name: "OpenCode Zen"},
	{ID: "opencode-go", Name: "OpenCode Go"},
	{ID: "huggingface", Name: "Hugging Face"},
	{ID: "fireworks", Name: "Fireworks"},
	{ID: "together", Name: "Together AI"},
	{ID: "kimi-coding", Name: "Kimi For Coding"},
	{ID: "minimax", Name: "MiniMax"},
	{ID: "xiaomi", Name: "Xiaomi MiMo"},
	{ID: "xiaomi-token-plan-cn", Name: "Xiaomi MiMo Token Plan (China)"},
	{ID: "xiaomi-token-plan-ams", Name: "Xiaomi MiMo Token Plan (Amsterdam)"},
	{ID: "xiaomi-token-plan-sgp", Name: "Xiaomi MiMo Token Plan (Singapore)"},
}

func AuthProviders() (AuthProvidersResponse, error) {
	path, err := authPath()
	if err != nil {
		return AuthProvidersResponse{}, err
	}
	stored, err := readAuthFile(path)
	if err != nil {
		return AuthProvidersResponse{}, err
	}
	providers := make([]AuthProviderStatus, 0, len(apiKeyAuthProviders))
	for _, provider := range apiKeyAuthProviders {
		credential, ok := stored[provider.ID]
		provider.Configured = ok
		if ok {
			provider.Source, _ = credential["type"].(string)
		}
		providers = append(providers, provider)
	}
	sort.Slice(providers, func(i, j int) bool { return providers[i].Name < providers[j].Name })
	return AuthProvidersResponse{Providers: providers, Path: path}, nil
}

func SaveAPIKey(req SaveAPIKeyRequest) (AuthProviderStatus, error) {
	if req.Provider == "" {
		return AuthProviderStatus{}, errors.New("provider is required")
	}
	if req.APIKey == "" {
		return AuthProviderStatus{}, errors.New("apiKey is required")
	}
	path, err := authPath()
	if err != nil {
		return AuthProviderStatus{}, err
	}
	stored, err := readAuthFile(path)
	if err != nil {
		return AuthProviderStatus{}, err
	}
	stored[req.Provider] = map[string]any{"type": "api_key", "key": req.APIKey}
	if err := writeAuthFile(path, stored); err != nil {
		return AuthProviderStatus{}, err
	}
	return AuthProviderStatus{ID: req.Provider, Name: authProviderName(req.Provider), Configured: true, Source: "api_key"}, nil
}

func LogoutProvider(provider string) error {
	if provider == "" {
		return errors.New("provider is required")
	}
	path, err := authPath()
	if err != nil {
		return err
	}
	stored, err := readAuthFile(path)
	if err != nil {
		return err
	}
	delete(stored, provider)
	return writeAuthFile(path, stored)
}

func authPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".pi", "agent", "auth.json"), nil
}

func readAuthFile(path string) (map[string]map[string]any, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) || len(data) == 0 {
		return map[string]map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	var auth map[string]map[string]any
	if err := json.Unmarshal(data, &auth); err != nil {
		return nil, err
	}
	if auth == nil {
		auth = map[string]map[string]any{}
	}
	return auth, nil
}

func writeAuthFile(path string, auth map[string]map[string]any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(auth)
}

func authProviderName(provider string) string {
	for _, item := range apiKeyAuthProviders {
		if item.ID == provider {
			return item.Name
		}
	}
	return provider
}
