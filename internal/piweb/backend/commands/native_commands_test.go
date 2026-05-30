package commands

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestListNativeSlashCommandsIncludesPromptsSkillsExtensionsAndPackages(t *testing.T) {
	home := t.TempDir()
	root := t.TempDir()
	t.Setenv("HOME", home)
	writeFile(t, filepath.Join(root, ".pi", "prompts", "review.md"), "---\ndescription: Review changes\nargument-hint: [scope]\n---\nBody")
	writeFile(t, filepath.Join(root, ".pi", "skills", "ship", "SKILL.md"), "---\nname: ship\ndescription: Ship the complete feature\n---\n# Ship")
	writeFile(t, filepath.Join(root, ".pi", "extensions", "hello.ts"), "import { registerHello } from './nested/register';\nexport function setup(pi: ExtensionAPI) { registerHello(pi) }\n")
	writeFile(t, filepath.Join(root, ".pi", "extensions", "nested", "register.ts"), "export function registerHello(pi: ExtensionAPI) { pi.registerCommand('hello', { description: 'Say hello' }) }\n")
	pkgRoot := filepath.Join(root, ".pi", "npm", "node_modules", "pkg")
	writeFile(t, filepath.Join(pkgRoot, "package.json"), `{"pi":{"prompts":["prompts"],"skills":["skills"],"extensions":["extensions"]}}`)
	writeFile(t, filepath.Join(pkgRoot, "prompts", "pkgprompt.md"), "Package prompt")
	writeFile(t, filepath.Join(pkgRoot, "skills", "pkgskill", "SKILL.md"), "---\nname: pkgskill\ndescription: Package skill\n---")
	writeFile(t, filepath.Join(pkgRoot, "extensions", "pkg.mjs"), "export default (pi) => pi.registerCommand('pkgext', { description: 'Package extension' })\n")
	writeFile(t, filepath.Join(root, ".pi", "settings.json"), `{"packages":["npm:pkg"]}`)

	result := ListNativeSlashCommands(context.Background(), root)
	for _, command := range []string{"/review", "/skill:ship", "/hello", "/pkgprompt", "/skill:pkgskill", "/pkgext", "/reload"} {
		if !hasCommand(result.Commands, command) {
			t.Fatalf("missing %s in %+v diagnostics=%+v", command, result.Commands, result.Diagnostics)
		}
	}
	for _, diagnostic := range result.Diagnostics {
		if strings.Contains(diagnostic.Path, "hello.ts") {
			t.Fatalf("expected static fallback to avoid diagnostics for hello.ts, got %+v", result.Diagnostics)
		}
	}
}

func TestStaticExtensionCommandsFindsLiteralRegisterCommands(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "extension.ts")
	writeFile(t, path, `export default (pi) => pi.registerCommand("hello", { description: "Say hello" })`)
	commands := staticExtensionCommands([]map[string]string{{"path": path, "scope": "project"}})
	if len(commands) != 1 || commands[0].Command != "/hello" || commands[0].Description != "Say hello" {
		t.Fatalf("unexpected static commands: %+v", commands)
	}
}

func TestExtensionProbeEnvSuppressesNodeExperimentalWarnings(t *testing.T) {
	env := extensionProbeEnv([]string{"HOME=/tmp", "NODE_OPTIONS=--max-old-space-size=64"}, "{}")
	if !containsEnv(env, "NODE_OPTIONS=--max-old-space-size=64 --disable-warning=ExperimentalWarning") {
		t.Fatalf("expected NODE_OPTIONS to preserve existing flags and suppress warnings, got %#v", env)
	}
	if !containsEnv(env, "PI_WEB_EXTENSION_PROBE=1") || !containsEnv(env, "PI_WEB_EXTENSION_PAYLOAD={}") {
		t.Fatalf("expected probe environment, got %#v", env)
	}
}

func TestCleanNodeWarningsRemovesSQLiteExperimentalWarning(t *testing.T) {
	stderr := strings.Join([]string{
		"signal detail",
		"(node:1) ExperimentalWarning: SQLite is an experimental feature and might change at any time",
		"(Use `node --trace-warnings ...` to show where the warning was created)",
		"real error",
	}, "\n")
	cleaned := cleanNodeWarnings(stderr)
	if strings.Contains(cleaned, "ExperimentalWarning") || strings.Contains(cleaned, "trace-warnings") {
		t.Fatalf("expected warning removed, got %q", cleaned)
	}
	if !strings.Contains(cleaned, "signal detail") || !strings.Contains(cleaned, "real error") {
		t.Fatalf("expected non-warning stderr preserved, got %q", cleaned)
	}
}

func TestPackageFiltersAndMissingDiagnostics(t *testing.T) {
	home := t.TempDir()
	root := t.TempDir()
	t.Setenv("HOME", home)
	pkgRoot := filepath.Join(root, ".pi", "npm", "node_modules", "pkg")
	writeFile(t, filepath.Join(pkgRoot, "package.json"), `{"pi":{"prompts":["prompts"]}}`)
	writeFile(t, filepath.Join(pkgRoot, "prompts", "keep.md"), "Keep")
	writeFile(t, filepath.Join(pkgRoot, "prompts", "drop.md"), "Drop")
	writeFile(t, filepath.Join(root, ".pi", "settings.json"), `{"packages":[{"source":"npm:pkg","prompts":["prompts/*.md","!prompts/drop.md"]},"npm:missing"]}`)

	result := ListNativeSlashCommands(context.Background(), root)
	if !hasCommand(result.Commands, "/keep") || hasCommand(result.Commands, "/drop") {
		t.Fatalf("unexpected commands: %+v", result.Commands)
	}
	foundMissing := false
	for _, diagnostic := range result.Diagnostics {
		if strings.Contains(diagnostic.Path, "missing") && diagnostic.Error == "package missing" {
			foundMissing = true
		}
	}
	if !foundMissing {
		t.Fatalf("expected missing package diagnostic, got %+v", result.Diagnostics)
	}
}

func hasCommand(commands []SlashCommand, command string) bool {
	for _, item := range commands {
		if item.Command == command {
			return true
		}
	}
	return false
}

func containsEnv(env []string, want string) bool {
	for _, item := range env {
		if item == want {
			return true
		}
	}
	return false
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
