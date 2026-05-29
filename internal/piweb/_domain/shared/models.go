package piweb

import (
	"context"
	"os"
	"os/exec"
	"sort"
	"strings"
	"time"
)

type WorkspaceModelsResponse struct {
	Providers []ModelProvider `json:"providers"`
	Error     string          `json:"error,omitempty"`
}

type ModelProvider struct {
	ID     string        `json:"id"`
	Models []ModelOption `json:"models"`
}

type ModelOption struct {
	ID       string `json:"id"`
	Provider string `json:"provider"`
	Context  string `json:"context,omitempty"`
	MaxOut   string `json:"maxOut,omitempty"`
	Thinking string `json:"thinking,omitempty"`
	Images   string `json:"images,omitempty"`
}

func WorkspaceModels(ctx context.Context, root string) (WorkspaceModelsResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "pi", "--no-extensions", "--list-models")
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "PI_SKIP_VERSION_CHECK=1")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return WorkspaceModelsResponse{}, err
	}
	return parseListModelsOutput(string(output)), nil
}

func fallbackWorkspaceModels(root string, err error) WorkspaceModelsResponse {
	provider, model := "zai", "gpt-5.5"
	if err != nil {
		provider, model = fallbackModelFromSettings(root)
	}
	response := WorkspaceModelsResponse{Providers: []ModelProvider{{ID: provider, Models: []ModelOption{{ID: model, Provider: provider}}}}}
	if err != nil {
		response.Error = err.Error()
	}
	return response
}

func fallbackModelFromSettings(root string) (string, string) {
	settings, err := WorkspaceSettings(root)
	if err != nil {
		return "zai", "gpt-5.5"
	}
	provider, _ := settings.Effective["defaultProvider"].(string)
	model, _ := settings.Effective["defaultModel"].(string)
	if strings.TrimSpace(provider) == "" {
		provider = "zai"
	}
	if strings.TrimSpace(model) == "" {
		model = "gpt-5.5"
	}
	return provider, model
}

func parseListModelsOutput(output string) WorkspaceModelsResponse {
	providerModels := map[string][]ModelOption{}
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 || fields[0] == "provider" || fields[1] == "model" {
			continue
		}
		model := ModelOption{ID: fields[1], Provider: fields[0]}
		if len(fields) > 2 {
			model.Context = fields[2]
		}
		if len(fields) > 3 {
			model.MaxOut = fields[3]
		}
		if len(fields) > 4 {
			model.Thinking = fields[4]
		}
		if len(fields) > 5 {
			model.Images = fields[5]
		}
		providerModels[model.Provider] = append(providerModels[model.Provider], model)
	}
	providers := make([]ModelProvider, 0, len(providerModels))
	for provider, models := range providerModels {
		sort.Slice(models, func(i, j int) bool { return models[i].ID < models[j].ID })
		providers = append(providers, ModelProvider{ID: provider, Models: models})
	}
	sort.Slice(providers, func(i, j int) bool { return providers[i].ID < providers[j].ID })
	return WorkspaceModelsResponse{Providers: providers}
}
