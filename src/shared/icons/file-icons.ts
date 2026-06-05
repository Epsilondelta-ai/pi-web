type IconPalette = { background: string; foreground: string; accent?: string };
type IconDefinition = { label: string; palette: IconPalette; folder?: boolean; open?: boolean };

export type FileIcon = { name: string; url: string };

type ResolveFileIconInput = { name: string; path?: string; kind: "file" | "dir"; open?: boolean };

const fileNames: Record<string, string> = {
  "readme.md": "readme",
  "package.json": "package",
  "bun.lock": "lock",
  "tsconfig.json": "config",
  "astro.config.mjs": "config",
  "vite.config.ts": "config",
};

const fileExtensions: Record<string, string> = {
  "d.ts": "typescript-def",
  astro: "astro",
  css: "css",
  go: "go",
  html: "html",
  js: "javascript",
  jsx: "react",
  json: "json",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  rs: "rust",
  sh: "shell",
  ts: "typescript",
  tsx: "react",
  yaml: "yaml",
  yml: "yaml",
};

const folderNames: Record<string, string> = {
  ".git": "folder-git",
  ".github": "folder-github",
  ".pi": "folder-pi",
  components: "folder-components",
  docs: "folder-docs",
  node_modules: "folder-node-modules",
  public: "folder-public",
  scripts: "folder-scripts",
  src: "folder-src",
  test: "folder-test",
  tests: "folder-test",
};

const iconDefinitions: Record<string, IconDefinition> = {
  astro: { label: "A", palette: { background: "#ff5d01", foreground: "#ffffff", accent: "#241033" } },
  config: { label: "⚙", palette: { background: "#64748b", foreground: "#ffffff" } },
  css: { label: "#", palette: { background: "#1572b6", foreground: "#ffffff" } },
  file: { label: "", palette: { background: "#94a3b8", foreground: "#ffffff" } },
  "folder-components": { label: "C", palette: { background: "#7c3aed", foreground: "#ffffff" }, folder: true },
  "folder-docs": { label: "D", palette: { background: "#0ea5e9", foreground: "#ffffff" }, folder: true },
  "folder-git": { label: "G", palette: { background: "#f97316", foreground: "#ffffff" }, folder: true },
  "folder-github": { label: "GH", palette: { background: "#111827", foreground: "#ffffff" }, folder: true },
  "folder-node-modules": { label: "N", palette: { background: "#65a30d", foreground: "#ffffff" }, folder: true },
  "folder-open": { label: "", palette: { background: "#fbbf24", foreground: "#78350f" }, folder: true, open: true },
  "folder-pi": { label: "π", palette: { background: "#ec4899", foreground: "#ffffff" }, folder: true },
  "folder-public": { label: "P", palette: { background: "#06b6d4", foreground: "#ffffff" }, folder: true },
  "folder-scripts": { label: "S", palette: { background: "#475569", foreground: "#ffffff" }, folder: true },
  "folder-src": { label: "S", palette: { background: "#22c55e", foreground: "#052e16" }, folder: true },
  "folder-src-open": { label: "S", palette: { background: "#86efac", foreground: "#052e16" }, folder: true, open: true },
  "folder-test": { label: "T", palette: { background: "#a855f7", foreground: "#ffffff" }, folder: true },
  folder: { label: "", palette: { background: "#eab308", foreground: "#713f12" }, folder: true },
  go: { label: "Go", palette: { background: "#00add8", foreground: "#ffffff" } },
  html: { label: "H", palette: { background: "#e34f26", foreground: "#ffffff" } },
  javascript: { label: "JS", palette: { background: "#f7df1e", foreground: "#1f2937" } },
  json: { label: "{}", palette: { background: "#f59e0b", foreground: "#111827" } },
  lock: { label: "🔒", palette: { background: "#334155", foreground: "#ffffff" } },
  markdown: { label: "M", palette: { background: "#475569", foreground: "#ffffff" } },
  package: { label: "⬢", palette: { background: "#cb3837", foreground: "#ffffff" } },
  python: { label: "Py", palette: { background: "#3776ab", foreground: "#ffde57" } },
  react: { label: "R", palette: { background: "#087ea4", foreground: "#ffffff" } },
  readme: { label: "R", palette: { background: "#2563eb", foreground: "#ffffff" } },
  rust: { label: "Rs", palette: { background: "#b7410e", foreground: "#ffffff" } },
  shell: { label: "$", palette: { background: "#16a34a", foreground: "#ffffff" } },
  "typescript-def": { label: "d", palette: { background: "#235a97", foreground: "#ffffff" } },
  typescript: { label: "TS", palette: { background: "#3178c6", foreground: "#ffffff" } },
  yaml: { label: "Y", palette: { background: "#dc2626", foreground: "#ffffff" } },
};

export function resolveFileIcon(input: ResolveFileIconInput): FileIcon {
  const iconName = input.kind === "dir" ? resolveFolderIcon(input.name, input.open) : resolveFileIconName(input.name, input.path);

  return { name: iconName, url: iconUrl(iconName) };
}

function resolveFolderIcon(name: string, open = false): string {
  const folderName = normalizeName(name);
  const specificIcon = folderNames[folderName];

  if (!specificIcon) {
    return open ? "folder-open" : "folder";
  }

  if (open && iconDefinitions[`${specificIcon}-open`]) {
    return `${specificIcon}-open`;
  }

  return specificIcon;
}

function resolveFileIconName(name: string, path = ""): string {
  const basename = normalizeName(name || path.split("/").pop() || "");
  const exactName = fileNames[basename];

  if (exactName) {
    return exactName;
  }

  for (const extension of extensionCandidates(basename)) {
    const icon = fileExtensions[extension];

    if (icon !== undefined) {
      return icon;
    }
  }

  return "file";
}

function extensionCandidates(basename: string): string[] {
  const parts = basename.split(".").filter(Boolean);

  if (parts.length <= 1) {
    return [];
  }

  return parts.slice(1).map((_, index) => parts.slice(index + 1).join(".")).sort((a, b) => b.length - a.length);
}

function iconUrl(iconName: string): string {
  const icon = iconDefinitions[iconName] || iconDefinitions.file;
  const svg = icon.folder ? folderSvg(icon) : fileSvg(icon);

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function fileSvg(icon: IconDefinition): string {
  const accent = icon.palette.accent || icon.palette.background;
  const label = escapeSvg(icon.label);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${icon.palette.background}" d="M5 2h9l5 5v15H5z"/><path fill="${accent}" d="M14 2v6h5"/><text x="12" y="17" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="7" font-weight="700" fill="${icon.palette.foreground}">${label}</text></svg>`;
}

function folderSvg(icon: IconDefinition): string {
  const lid = icon.open ? "M2 8h8l2 2h10v2H2z" : "M2 6h7l2 2h11v3H2z";
  const body = icon.open ? "M3 10h20l-3 10H1z" : "M2 9h20v11H2z";
  const label = escapeSvg(icon.label);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${icon.palette.background}" d="${lid}"/><path fill="${icon.palette.background}" d="${body}"/><text x="12" y="17" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="7" font-weight="700" fill="${icon.palette.foreground}">${label}</text></svg>`;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function escapeSvg(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
