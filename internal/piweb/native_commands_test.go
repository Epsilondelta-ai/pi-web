package piweb

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
	writeFile(t, filepath.Join(root, ".pi", "extensions", "hello.ts"), "import { helper } from './missing';\nexport function setup(pi: ExtensionAPI) { helper(); pi.registerCommand('hello', { description: 'Say hello' }) }\n")
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

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
