package piweb

func NewMockStore() *Store {
	workspaces := []Workspace{
		{ID: "pi-mono", Name: "pi-mono", Path: "~/code/pi-mono", SessionCount: 6, LastUsed: "3h ago", Live: true, Sessions: []Session{
			{ID: "8e7c-44ff", Title: "port pi-tui to web", LastUsed: "live", Live: true, Active: true, Workspace: "pi-mono"},
			{ID: "3f4a-1c2b", Title: "refactor bash tool", LastUsed: "3h ago", Workspace: "pi-mono"},
			{ID: "9d12-aa01", Title: "add Cloudflare provider", LastUsed: "yesterday", Workspace: "pi-mono"},
			{ID: "2210-3b1e", Title: "draft AGENTS.md", LastUsed: "5d ago", Workspace: "pi-mono"},
			{ID: "4471-77aa", Title: "fix shell completion", LastUsed: "1w ago", Workspace: "pi-mono"},
			{ID: "0c98-1122", Title: "wire session export", LastUsed: "2w ago", Workspace: "pi-mono"},
		}},
		{ID: "openclaw", Name: "openclaw", Path: "~/code/openclaw", SessionCount: 3, LastUsed: "yesterday", Sessions: []Session{
			{ID: "aa11-2233", Title: "tighten retrieval prompt", LastUsed: "yesterday", Workspace: "openclaw"},
			{ID: "bb44-5566", Title: "ship eval harness", LastUsed: "3d ago", Workspace: "openclaw"},
			{ID: "cc77-8899", Title: "first pass", LastUsed: "1mo ago", Workspace: "openclaw"},
		}},
		{ID: "dotfiles", Name: "dotfiles", Path: "~/.dotfiles", SessionCount: 1, LastUsed: "1mo ago", Sessions: []Session{{ID: "ff00-1234", Title: "zsh prompt reflow", LastUsed: "1mo ago", Workspace: "dotfiles"}}},
		{ID: "design-system", Name: "pi-web-ds", Path: "/Users/jay/.../pi-mono/packages/web-ds", SessionCount: 0, LastUsed: "—"},
	}
	files := []FileNode{{Type: "dir", Name: "packages", Depth: 0, Open: true, Children: []FileNode{{Type: "dir", Name: "coding-agent", Depth: 1, Open: true, Children: []FileNode{{Type: "dir", Name: "src", Depth: 2, Open: true, Children: []FileNode{{Type: "dir", Name: "tools", Depth: 3, Open: true, Children: []FileNode{{Type: "file", Name: "bash.ts", Depth: 4, Status: "modified"}, {Type: "file", Name: "edit.ts", Depth: 4}, {Type: "file", Name: "read.ts", Depth: 4}, {Type: "file", Name: "processes.ts", Depth: 4, Status: "added"}}}, {Type: "file", Name: "agent.ts", Depth: 3}, {Type: "file", Name: "cli.ts", Depth: 3}, {Type: "file", Name: "session.ts", Depth: 3}}}, {Type: "file", Name: "README.md", Depth: 2}, {Type: "file", Name: "package.json", Depth: 2}}}, {Type: "dir", Name: "pi-tui", Depth: 1}, {Type: "dir", Name: "web", Depth: 1}}}, {Type: "file", Name: "AGENTS.md", Depth: 0, Status: "modified"}, {Type: "file", Name: "SYSTEM.md", Depth: 0}, {Type: "file", Name: "README.md", Depth: 0}, {Type: "file", Name: "package.json", Depth: 0}}
	conversation := []Message{{Kind: "banner", Text: "┌─ session · 8e7c-44ff ──────────────────────┐\n│  <a>pi > ready</a>  ·  sonnet:high · auto-accept   │\n│  <a>ws</a> pi-mono · <d>main</d> · <t>3 files modified</t>   │\n└────────────────────────────────────────────┘"}, {Kind: "user", Text: "refactor the bash tool to handle background processes. keep the existing sync path as the default, and add a `processes` tool to list / signal / harvest output."}, {Kind: "think", Text: "tmux integration vs `&` with disown. bash tool currently shells out synchronously — need a process registry keyed by short id."}, {Kind: "pi", Text: "I'll add a <code>background:true</code> flag to <tool>bash</tool> and a sibling <tool>processes</tool> tool."}, {Kind: "tool", Tool: "bash", Args: "$ rg \"tool\" packages/coding-agent/src --files-with-matches", Status: "ok", DurationMs: 184, ResultMeta: "3 results", Body: "packages/coding-agent/src/tools/bash.ts\npackages/coding-agent/src/tools/edit.ts\npackages/coding-agent/src/tools/read.ts"}}
	return &Store{workspaces: workspaces, files: map[string][]FileNode{"pi-mono": files, "openclaw": files, "dotfiles": files, "design-system": files}, conversations: map[string][]Message{"8e7c-44ff": conversation}, workspacePath: map[string]string{"pi-mono": ".", "openclaw": ".", "dotfiles": ".", "design-system": "."}, sessionFiles: map[string]string{}, sessionCWD: map[string]string{"8e7c-44ff": "."}}
}
