package commands

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type commandDiagnostic struct {
	Path  string `json:"path,omitempty"`
	Error string `json:"error"`
}

type commandResource struct {
	Path  string
	Scope string
}

type packageFilter map[string][]string

type resolvedPackage struct {
	Root     string
	Scope    string
	Identity string
	Filter   packageFilter
}

type NativeCommandResult struct {
	Commands    []SlashCommand      `json:"commands"`
	Diagnostics []commandDiagnostic `json:"diagnostics,omitempty"`
}

func ListNativeSlashCommands(ctx context.Context, cwd string) NativeCommandResult {
	result := NativeCommandResult{}
	resources := discoverCommandResources(cwd, &result.Diagnostics)
	seen := map[string]SlashCommand{}
	add := func(cmd SlashCommand) {
		if cmd.Name == "" || cmd.Command == "/" {
			return
		}
		key := cmd.Command
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = cmd
		result.Commands = append(result.Commands, cmd)
	}
	for _, dir := range resources.Prompts {
		for _, cmd := range scanPromptCommands(dir.Path, dir.Scope, &result.Diagnostics) {
			add(cmd)
		}
	}
	for _, dir := range resources.Skills {
		for _, cmd := range scanSkillCommands(dir.Path, dir.Scope, &result.Diagnostics) {
			add(cmd)
		}
	}
	for _, cmd := range probeExtensionCommands(ctx, cwd, resources.Extensions, &result.Diagnostics) {
		add(cmd)
	}
	add(SlashCommand{Name: "reload", Command: "/reload", Description: "Reload commands, extensions, skills, prompts, and context", Source: "pi-web", Scope: "project"})
	sort.SliceStable(result.Commands, func(i, j int) bool { return result.Commands[i].Command < result.Commands[j].Command })
	return result
}

type commandResources struct {
	Prompts    []commandResource
	Skills     []commandResource
	Extensions []commandResource
}

func discoverCommandResources(cwd string, diagnostics *[]commandDiagnostic) commandResources {
	var out commandResources
	home, _ := os.UserHomeDir()
	add := func(dst *[]commandResource, path, scope string) {
		if path == "" {
			return
		}
		*dst = append(*dst, commandResource{Path: filepath.Clean(path), Scope: scope})
	}
	if home != "" {
		add(&out.Prompts, filepath.Join(home, ".pi", "agent", "prompts"), "global")
		add(&out.Skills, filepath.Join(home, ".pi", "agent", "skills"), "global")
		add(&out.Skills, filepath.Join(home, ".agents", "skills"), "global")
		add(&out.Extensions, filepath.Join(home, ".pi", "agent", "extensions"), "global")
	}
	add(&out.Prompts, filepath.Join(cwd, ".pi", "prompts"), "project")
	add(&out.Skills, filepath.Join(cwd, ".pi", "skills"), "project")
	add(&out.Extensions, filepath.Join(cwd, ".pi", "extensions"), "project")
	for _, dir := range ancestorAgentSkillDirs(cwd) {
		add(&out.Skills, dir, "project")
	}
	for _, pkg := range resolveSettingsPackages(cwd, home, diagnostics) {
		for _, p := range packageResourcePaths(pkg, "prompts") {
			add(&out.Prompts, p, pkg.Scope)
		}
		for _, p := range packageResourcePaths(pkg, "skills") {
			add(&out.Skills, p, pkg.Scope)
		}
		for _, p := range packageResourcePaths(pkg, "extensions") {
			add(&out.Extensions, p, pkg.Scope)
		}
	}
	return out
}

func ancestorAgentSkillDirs(cwd string) []string {
	var dirs []string
	current := filepath.Clean(cwd)
	for {
		dirs = append(dirs, filepath.Join(current, ".agents", "skills"))
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		if _, err := os.Stat(filepath.Join(current, ".git")); err == nil {
			break
		}
		current = parent
	}
	return dirs
}

func scanPromptCommands(dir, scope string, diagnostics *[]commandDiagnostic) []SlashCommand {
	info, statErr := os.Stat(dir)
	if statErr != nil {
		return nil
	}
	baseDir := dir
	var entries []os.DirEntry
	if info.IsDir() {
		readEntries, err := os.ReadDir(dir)
		if err != nil {
			return nil
		}
		entries = readEntries
	} else {
		entries = []os.DirEntry{dirEntryInfo{info: info}}
		baseDir = filepath.Dir(dir)
	}
	var commands []SlashCommand
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		path := filepath.Join(baseDir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			*diagnostics = append(*diagnostics, commandDiagnostic{Path: path, Error: err.Error()})
			continue
		}
		fm, body := parseSimpleFrontmatter(string(data))
		name := strings.TrimSuffix(entry.Name(), ".md")
		desc := strings.TrimSpace(fm["description"])
		if desc == "" {
			desc = firstBodyLine(body)
		}
		commands = append(commands, SlashCommand{Name: name, Command: "/" + name, Description: desc, Source: "prompt", Scope: scope, Path: path})
	}
	return commands
}

func scanSkillCommands(dir, scope string, diagnostics *[]commandDiagnostic) []SlashCommand {
	var commands []SlashCommand
	info, err := os.Stat(dir)
	if err != nil {
		return nil
	}
	if !info.IsDir() {
		return loadSkillCommand(dir, scope, diagnostics)
	}
	allowRootMD := strings.Contains(filepath.ToSlash(dir), "/.pi/agent/skills") || strings.Contains(filepath.ToSlash(dir), "/.pi/skills")
	_ = filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.IsDir() {
			if path != dir && fileExists(filepath.Join(path, "SKILL.md")) {
				commands = append(commands, loadSkillCommand(filepath.Join(path, "SKILL.md"), scope, diagnostics)...)
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Name() == "SKILL.md" && filepath.Dir(path) == dir {
			commands = append(commands, loadSkillCommand(path, scope, diagnostics)...)
		}
		if allowRootMD && filepath.Dir(path) == dir && strings.HasSuffix(entry.Name(), ".md") && entry.Name() != "SKILL.md" {
			commands = append(commands, loadSkillCommand(path, scope, diagnostics)...)
		}
		return nil
	})
	return commands
}

func loadSkillCommand(path, scope string, diagnostics *[]commandDiagnostic) []SlashCommand {
	data, err := os.ReadFile(path)
	if err != nil {
		*diagnostics = append(*diagnostics, commandDiagnostic{Path: path, Error: err.Error()})
		return nil
	}
	fm, _ := parseSimpleFrontmatter(string(data))
	name := strings.TrimSpace(fm["name"])
	desc := strings.TrimSpace(fm["description"])
	if name == "" || desc == "" {
		return nil
	}
	return []SlashCommand{{Name: "skill:" + name, Command: "/skill:" + name, Description: desc, Source: "skill", Scope: scope, Path: path}}
}

func parseSimpleFrontmatter(content string) (map[string]string, string) {
	fm := map[string]string{}
	if !strings.HasPrefix(content, "---\n") && !strings.HasPrefix(content, "---\r\n") {
		return fm, content
	}
	lines := strings.Split(content, "\n")
	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "---" {
			for _, line := range lines[1:i] {
				key, val, ok := strings.Cut(line, ":")
				if ok {
					fm[strings.TrimSpace(key)] = strings.Trim(strings.TrimSpace(val), "\"'")
				}
			}
			return fm, strings.Join(lines[i+1:], "\n")
		}
	}
	return fm, content
}

func firstBodyLine(body string) string {
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			if len(line) > 60 {
				return line[:60] + "..."
			}
			return line
		}
	}
	return ""
}

func resolveSettingsPackages(cwd, home string, diagnostics *[]commandDiagnostic) []resolvedPackage {
	var packages []resolvedPackage
	if home != "" {
		packages = append(packages, readPackageSettings(filepath.Join(home, ".pi", "agent", "settings.json"), filepath.Join(home, ".pi", "agent"), "global", diagnostics)...)
	}
	packages = append(packages, readPackageSettings(filepath.Join(cwd, ".pi", "settings.json"), filepath.Join(cwd, ".pi"), "project", diagnostics)...)
	seen := map[string]resolvedPackage{}
	for _, pkg := range packages {
		seen[pkg.Identity] = pkg
	}
	packages = packages[:0]
	for _, pkg := range seen {
		packages = append(packages, pkg)
	}
	return packages
}

func readPackageSettings(settingsPath, baseDir, scope string, diagnostics *[]commandDiagnostic) []resolvedPackage {
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		return nil
	}
	var settings struct {
		Packages []any `json:"packages"`
	}
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil
	}
	var packages []resolvedPackage
	for _, item := range settings.Packages {
		source := ""
		switch v := item.(type) {
		case string:
			source = v
		case map[string]any:
			source, _ = v["source"].(string)
		}
		if root := resolvePackageRoot(source, baseDir); root != "" {
			if !fileExists(root) {
				*diagnostics = append(*diagnostics, commandDiagnostic{Path: root, Error: "package missing"})
			}
			packages = append(packages, resolvedPackage{
				Root:     root,
				Scope:    scope,
				Identity: packageIdentity(source, root),
				Filter:   packageEntryFilter(item),
			})
		}
	}
	return packages
}

func packageEntryFilter(item any) packageFilter {
	object, ok := item.(map[string]any)
	if !ok {
		return nil
	}
	filter := packageFilter{}
	for _, kind := range []string{"prompts", "skills", "extensions", "themes"} {
		raw, exists := object[kind]
		if !exists {
			continue
		}
		arr, ok := raw.([]any)
		if !ok {
			continue
		}
		filter[kind] = []string{}
		for _, item := range arr {
			if s, ok := item.(string); ok {
				filter[kind] = append(filter[kind], s)
			}
		}
	}
	return filter
}

func packageIdentity(source, root string) string {
	if strings.HasPrefix(source, "npm:") {
		name := strings.TrimPrefix(source, "npm:")
		if at := strings.LastIndex(name, "@"); at > 0 {
			name = name[:at]
		}
		return "npm:" + name
	}
	if strings.HasPrefix(source, "git:") || strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") || strings.HasPrefix(source, "ssh://") {
		clean := strings.TrimPrefix(source, "git:")
		if at := strings.LastIndex(clean, "@"); at > strings.LastIndex(clean, "/") {
			clean = clean[:at]
		}
		return "git:" + clean
	}
	return "local:" + root
}

func resolvePackageRoot(source, baseDir string) string {
	if source == "" {
		return ""
	}
	if strings.HasPrefix(source, "npm:") {
		name := strings.TrimPrefix(source, "npm:")
		if at := strings.LastIndex(name, "@"); at > 0 {
			name = name[:at]
		}
		return filepath.Join(baseDir, "npm", "node_modules", filepath.FromSlash(name))
	}
	if strings.HasPrefix(source, "git:") || strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") || strings.HasPrefix(source, "ssh://") {
		clean := strings.TrimPrefix(source, "git:")
		if at := strings.LastIndex(clean, "@"); at > strings.LastIndex(clean, "/") {
			clean = clean[:at]
		}
		clean = strings.TrimPrefix(strings.TrimPrefix(clean, "https://"), "http://")
		clean = strings.TrimPrefix(clean, "ssh://")
		clean = strings.TrimPrefix(clean, "git@")
		clean = strings.ReplaceAll(clean, ":", "/")
		return filepath.Join(baseDir, "git", filepath.FromSlash(clean))
	}
	if filepath.IsAbs(source) {
		return source
	}
	return filepath.Join(filepath.Dir(filepath.Join(baseDir, "settings.json")), source)
}

func packageResourcePaths(pkg resolvedPackage, kind string) []string {
	if pkg.Root == "" || !fileExists(pkg.Root) {
		return nil
	}
	paths := packageAllowedResourcePaths(pkg.Root, kind)
	patterns, filtered := pkg.Filter[kind]
	if !filtered {
		return paths
	}
	if len(patterns) == 0 {
		return nil
	}
	return applyPackageResourceFilter(pkg.Root, paths, patterns)
}

func packageAllowedResourcePaths(root, kind string) []string {
	pkgPath := filepath.Join(root, "package.json")
	data, err := os.ReadFile(pkgPath)
	if err == nil {
		var pkg struct {
			Pi map[string]any `json:"pi"`
		}
		if json.Unmarshal(data, &pkg) == nil && pkg.Pi != nil {
			if raw, ok := pkg.Pi[kind]; ok {
				return packageManifestPaths(root, raw)
			}
		}
	}
	return []string{filepath.Join(root, kind)}
}

func packageManifestPaths(root string, raw any) []string {
	var paths []string
	if arr, ok := raw.([]any); ok {
		for _, item := range arr {
			if s, ok := item.(string); ok && !strings.HasPrefix(s, "!") && !strings.HasPrefix(s, "+") && !strings.HasPrefix(s, "-") {
				paths = append(paths, filepath.Join(root, s))
			}
		}
	}
	return paths
}

func applyPackageResourceFilter(root string, allowed []string, patterns []string) []string {
	allowedFiles := expandResourcePaths(allowed)
	included := map[string]bool{}
	for _, pattern := range patterns {
		if pattern == "" {
			continue
		}
		mode := byte(0)
		if strings.HasPrefix(pattern, "!") || strings.HasPrefix(pattern, "+") || strings.HasPrefix(pattern, "-") {
			mode = pattern[0]
			pattern = pattern[1:]
		}
		matches := matchPackagePattern(root, allowedFiles, pattern)
		if mode == '+' {
			matches = []string{filepath.Join(root, filepath.FromSlash(pattern))}
		}
		for _, path := range matches {
			if mode == '!' || mode == '-' {
				delete(included, path)
			} else {
				included[path] = true
			}
		}
	}
	var paths []string
	for path := range included {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	return paths
}

func expandResourcePaths(paths []string) []string {
	var files []string
	for _, path := range paths {
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		if !info.IsDir() {
			files = append(files, path)
			continue
		}
		_ = filepath.WalkDir(path, func(file string, entry os.DirEntry, err error) error {
			if err == nil && !entry.IsDir() {
				files = append(files, file)
			}
			return nil
		})
	}
	return files
}

func matchPackagePattern(root string, files []string, pattern string) []string {
	var matches []string
	pattern = filepath.ToSlash(strings.TrimPrefix(pattern, "./"))
	for _, file := range files {
		rel, err := filepath.Rel(root, file)
		if err != nil {
			continue
		}
		rel = filepath.ToSlash(rel)
		matched, _ := filepath.Match(pattern, rel)
		if matched || rel == pattern || strings.HasPrefix(rel, strings.TrimSuffix(pattern, "/")+"/") {
			matches = append(matches, file)
		}
	}
	return matches
}

type dirEntryInfo struct{ info os.FileInfo }

func (d dirEntryInfo) Name() string               { return d.info.Name() }
func (d dirEntryInfo) IsDir() bool                { return d.info.IsDir() }
func (d dirEntryInfo) Type() os.FileMode          { return d.info.Mode().Type() }
func (d dirEntryInfo) Info() (os.FileInfo, error) { return d.info, nil }

func fileExists(path string) bool { _, err := os.Stat(path); return err == nil }

func probeExtensionCommands(ctx context.Context, cwd string, extensions []commandResource, diagnostics *[]commandDiagnostic) []SlashCommand {
	files := extensionFiles(extensions)
	if len(files) == 0 {
		return nil
	}
	probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	payload, _ := json.Marshal(map[string]any{"cwd": cwd, "extensions": files})
	cmd := exec.CommandContext(probeCtx, "node", "--input-type=module", "-")
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "PI_WEB_EXTENSION_PROBE=1", "PI_WEB_EXTENSION_PAYLOAD="+string(payload))
	cmd.Stdin = strings.NewReader(extensionProbeScript)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		*diagnostics = append(*diagnostics, commandDiagnostic{Error: fmt.Sprintf("extension probe failed: %v %s", err, truncate(stderr.String(), 300))})
		return nil
	}
	var response struct {
		Commands []SlashCommand      `json:"commands"`
		Errors   []commandDiagnostic `json:"errors"`
	}
	if err := json.Unmarshal(stdout.Bytes(), &response); err != nil {
		*diagnostics = append(*diagnostics, commandDiagnostic{Error: "extension probe returned invalid JSON"})
		return nil
	}
	*diagnostics = append(*diagnostics, response.Errors...)
	return response.Commands
}

func extensionFiles(resources []commandResource) []map[string]string {
	var files []map[string]string
	for _, resource := range resources {
		info, statErr := os.Stat(resource.Path)
		if statErr == nil && !info.IsDir() {
			ext := filepath.Ext(resource.Path)
			if ext == ".js" || ext == ".mjs" || ext == ".ts" {
				files = append(files, map[string]string{"path": resource.Path, "scope": resource.Scope})
			}
			continue
		}
		_ = filepath.WalkDir(resource.Path, func(path string, entry os.DirEntry, err error) error {
			if err != nil || entry.IsDir() {
				return nil
			}
			ext := filepath.Ext(entry.Name())
			if ext == ".js" || ext == ".mjs" || ext == ".ts" {
				files = append(files, map[string]string{"path": path, "scope": resource.Scope})
			}
			return nil
		})
	}
	return files
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

const extensionProbeScript = `
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const input = JSON.parse(process.env.PI_WEB_EXTENSION_PAYLOAD || '{}');
function stripTypeScript(source) {
  return source
    .replace(/^\s*import\s+type\s+[^;]+;?\s*$/gm, '')
    .replace(/:\s*[A-Za-z_$][A-Za-z0-9_$]*(?:<[^=;,){}]+>)?(?=\s*[,)=;{])/g, '')
    .replace(/\s+as\s+[A-Za-z_$][A-Za-z0-9_$.]*(?:<[^;,){}]+>)?/g, '')
    .replace(/interface\s+[A-Za-z_$][A-Za-z0-9_$]*\s*{[^}]*}/g, '');
}
async function importExtension(path) {
  if (!path.endsWith('.ts')) return import(pathToFileURL(path).href);
  const source = stripTypeScript(readFileSync(path, 'utf8'));
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  return import(moduleUrl);
}
function staticCommandFallback(path, seen = new Set()) {
  if (seen.has(path)) return [];
  seen.add(path);
  let source = '';
  try { source = readFileSync(path, 'utf8'); } catch { return []; }
  const commands = [];
  const commandPattern = /registerCommand\s*\(\s*['\"]([^'\"]+)['\"]\s*,\s*{[\s\S]*?description\s*:\s*['\"]([^'\"]*)['\"]/g;
  for (const match of source.matchAll(commandPattern)) commands.push({ name: match[1], description: match[2] });
  const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'\"]*?\s+from\s+)?['\"](\.[^'\"]+)['\"]/g;
  for (const match of source.matchAll(importPattern)) {
    const resolved = resolveRelativeModule(path, match[1]);
    if (resolved) commands.push(...staticCommandFallback(resolved, seen));
  }
  return commands;
}
function resolveRelativeModule(from, specifier) {
  const base = new URL(specifier, pathToFileURL(dirname(from) + '/'));
  const path = base.pathname;
  const candidates = path.match(/\.[cm]?[jt]s$/) ? [path] : [path + '.ts', path + '.js', path + '.mjs', path + '.cjs', path + '/index.ts', path + '/index.js'];
  for (const candidate of candidates) {
    try { readFileSync(candidate, 'utf8'); return candidate; } catch {}
  }
  return '';
}
const commands = [];
const errors = [];
function fakePi(ext) {
  const target = {
    registerCommand(name, options = {}) {
      commands.push({ name: String(name), command: '/' + String(name), description: options?.description || '', source: 'extension', scope: ext.scope || '', path: ext.path });
    },
    registerTool(){}, registerShortcut(){}, registerFlag(){}, on(){}, use(){}, addProvider(){},
  };
  return new Proxy(target, { get(t, p) { return p in t ? t[p] : (() => undefined); } });
}
for (const ext of input.extensions || []) {
  try {
    const mod = await importExtension(ext.path);
    const setup = typeof mod.default === 'function' ? mod.default : (mod.setup || mod.default?.setup);
    if (typeof setup === 'function') await setup(fakePi(ext));
  } catch (error) {
    const fallback = staticCommandFallback(ext.path);
    for (const command of fallback) {
      commands.push({ name: command.name, command: '/' + command.name, description: command.description, source: 'extension', scope: ext.scope || '', path: ext.path });
    }
    if (fallback.length === 0) errors.push({ path: ext.path, error: String(error?.message || error).slice(0, 300) });
  }
}
console.log(JSON.stringify({ commands, errors }));
`
