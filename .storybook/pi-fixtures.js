const WORKSPACES = [
  {
    id: "pi-mono",
    name: "pi-mono",
    path: "~/code/pi-mono",
    sessionCount: 12,
    lastUsed: "3h ago",
    live: true,
    sessions: [
      { id: "8e7c-44ff", title: "port pi-tui to web", lastUsed: "live", live: true, active: true },
      { id: "3f4a-1c2b", title: "refactor bash tool", lastUsed: "3h ago" },
      { id: "9d12-aa01", title: "add Cloudflare provider", lastUsed: "yesterday" },
      { id: "2210-3b1e", title: "draft AGENTS.md", lastUsed: "5d ago" },
      { id: "4471-77aa", title: "fix shell completion", lastUsed: "1w ago" },
      { id: "0c98-1122", title: "wire session export", lastUsed: "2w ago" },
    ],
  },
  {
    id: "openclaw",
    name: "openclaw",
    path: "~/code/openclaw",
    sessionCount: 3,
    lastUsed: "yesterday",
    live: false,
    sessions: [
      { id: "aa11-2233", title: "tighten retrieval prompt", lastUsed: "yesterday" },
      { id: "bb44-5566", title: "ship eval harness", lastUsed: "3d ago" },
      { id: "cc77-8899", title: "first pass", lastUsed: "1mo ago" },
    ],
  },
  {
    id: "dotfiles",
    name: "dotfiles",
    path: "~/.dotfiles",
    sessionCount: 1,
    lastUsed: "1mo ago",
    live: false,
    sessions: [
      { id: "ff00-1234", title: "zsh prompt reflow", lastUsed: "1mo ago" },
    ],
  },
  {
    id: "design-system",
    name: "pi-web-ds",
    path: "/Users/jay/.../pi-mono/packages/web-ds",
    sessionCount: 0,
    lastUsed: "—",
    live: false,
    sessions: [],
  },
];

const FILE_TREE = [
  { type: "dir", name: "packages", depth: 0, open: true, children: [
    { type: "dir", name: "coding-agent", depth: 1, open: true, children: [
      { type: "dir", name: "src", depth: 2, open: true, children: [
        { type: "dir", name: "tools", depth: 3, open: true, children: [
          { type: "file", name: "bash.ts", depth: 4, status: "modified" },
          { type: "file", name: "edit.ts", depth: 4 },
          { type: "file", name: "read.ts", depth: 4 },
          { type: "file", name: "processes.ts", depth: 4, status: "added" },
        ]},
        { type: "file", name: "agent.ts", depth: 3 },
        { type: "file", name: "cli.ts", depth: 3 },
        { type: "file", name: "session.ts", depth: 3 },
      ]},
      { type: "file", name: "README.md", depth: 2 },
      { type: "file", name: "package.json", depth: 2 },
    ]},
    { type: "dir", name: "pi-tui", depth: 1, open: false },
    { type: "dir", name: "web", depth: 1, open: false },
  ]},
  { type: "file", name: "AGENTS.md", depth: 0, status: "modified" },
  { type: "file", name: "SYSTEM.md", depth: 0 },
  { type: "file", name: "README.md", depth: 0 },
  { type: "file", name: "package.json", depth: 0 },
];

const CONVERSATION = [
  {
    kind: "banner",
    text: [
      "┌─ session · 8e7c-44ff ──────────────────────┐",
      "│  <a>pi > ready</a>  ·  sonnet:high · auto-accept   │",
      "│  <a>ws</a> pi-mono · <d>main</d> · <t>3 files modified</t>   │",
      "└────────────────────────────────────────────┘",
    ].join("\n"),
  },
  { kind: "user", text: "refactor the bash tool to handle background processes. keep the existing sync path as the default, and add a `processes` tool to list / signal / harvest output." },
  {
    kind: "think",
    text: "tmux integration vs `&` with disown. bash tool currently shells out synchronously — need a process registry keyed by short id. harvest returns stdout + exit code if reaped, or status:'running' otherwise.",
  },
  {
    kind: "pi",
    text: "I'll add a <code>background:true</code> flag to <tool>bash</tool> and a sibling <tool>processes</tool> tool with three actions: <code>list</code>, <code>signal</code>, <code>harvest</code>. Process state stored in `~/.pi/processes.json`. Starting with a code scan first.",
  },
  {
    kind: "tool",
    tool: "bash",
    args: "$ rg \"tool\" packages/coding-agent/src --files-with-matches",
    status: "ok",
    durationMs: 184,
    resultMeta: "3 results",
    body: [
      "packages/coding-agent/src/tools/bash.ts",
      "packages/coding-agent/src/tools/edit.ts",
      "packages/coding-agent/src/tools/read.ts",
    ].join("\n"),
  },
  {
    kind: "tool",
    tool: "read",
    args: "packages/coding-agent/src/tools/bash.ts",
    status: "ok",
    durationMs: 22,
    resultMeta: "142 lines",
    collapsedByDefault: true,
    body: [
      "import { spawn } from 'node:child_process'",
      "import { defineTool } from '../tool'",
      "",
      "export const bashTool = defineTool({",
      "  name: 'bash',",
      "  description: 'Run a bash command. Defaults to sync.',",
      "  schema: { command: 'string', timeout: 'number?' },",
      "  async run({ command, timeout }) {",
      "    … 120 more lines …",
      "  },",
      "})",
    ].join("\n"),
  },
  {
    kind: "tool",
    tool: "edit",
    args: "packages/coding-agent/src/tools/bash.ts  +42 −8",
    status: "ok",
    durationMs: 64,
    resultMeta: "applied",
    body: [
      "<rm>-  async run({ command, timeout }) {</rm>",
      "<ad>+  async run({ command, timeout, background }) {</ad>",
      "<ad>+    if (background) {</ad>",
      "<ad>+      const pid = await spawnBg(command)</ad>",
      "<ad>+      registry.add(pid, command)</ad>",
      "<ad>+      return { pid, status: 'running' }</ad>",
      "<ad>+    }</ad>",
      "     const child = spawn('bash', ['-c', command])",
    ].join("\n"),
  },
  {
    kind: "tool",
    tool: "write",
    args: "packages/coding-agent/src/tools/processes.ts  (new, 68 lines)",
    status: "ok",
    durationMs: 31,
    resultMeta: "created",
    collapsedByDefault: true,
    body: "new file: 68 lines of process registry + list/signal/harvest impl",
  },
  {
    kind: "tool",
    tool: "bash",
    args: "$ pnpm test packages/coding-agent",
    status: "running",
    body: "<a>RUNS</a>  packages/coding-agent/test/bash.spec.ts\n<a>PASS</a>  packages/coding-agent/test/edit.spec.ts\n<y>...</y>",
  },
  {
    kind: "pi",
    text: "tests still running. while we wait — should background processes inherit the agent's working dir, or take an explicit <code>cwd</code> arg? the second is safer for parallel work but more verbose.<cursor></cursor>",
    running: true,
  },
];

const SLASH_COMMANDS = [
  { command: "/review", description: "Review staged git changes", source: "prompt", scope: "project" },
  { command: "/skill:init-project", description: "Use when creating a new project", source: "skill", scope: "project" },
  { command: "/team", description: "Coordinate a team of agents", source: "extension", scope: "global" },
  { command: "/websearch", description: "Open web search curator", source: "extension", scope: "global" },
];

const MODEL_OPTIONS = [
  { name: "sonnet:high",  desc: "claude-sonnet-4.5 · extended thinking",     badge: "current" },
  { name: "sonnet:base",  desc: "claude-sonnet-4.5 · default",                badge: "" },
  { name: "haiku:high",   desc: "claude-haiku-4.5 · faster, smaller context", badge: "" },
  { name: "opus:high",    desc: "claude-opus-4.1 · slow, best at reasoning", badge: "" },
  { name: "gpt-5-codex",  desc: "openai · via /provider openai",              badge: "" },
  { name: "qwen3-coder",  desc: "via /provider local · ollama",               badge: "" },
];

const PI_DATA = { WORKSPACES, FILE_TREE, CONVERSATION, SLASH_COMMANDS, MODEL_OPTIONS };

export { WORKSPACES, FILE_TREE, CONVERSATION, SLASH_COMMANDS, MODEL_OPTIONS, PI_DATA };
