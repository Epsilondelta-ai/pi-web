export type RawFileNode = {
  type?: "file" | "dir" | string;
  name: string;
  path?: string;
  depth?: number;
  open?: boolean;
  status?: GitFileStatus | string;
  children?: RawFileNode[];
};

export type GitFileStatus = "modified" | "added" | "untracked" | "deleted" | "renamed" | "clean";

export type FileTreeNode = {
  id: string;
  name: string;
  path: string;
  kind: "file" | "dir";
  children?: FileTreeNode[];
  gitStatus: GitFileStatus;
  dirtyDescendants: boolean;
  selected: boolean;
  expanded: boolean;
};

export type GitStatusMap = Record<string, GitFileStatus | string | undefined>;

const DIRTY_STATUSES = new Set<GitFileStatus>(["modified", "added", "untracked", "deleted", "renamed"]);

export function decorateFileTree(
  nodes: RawFileNode[] = [],
  statusMap: GitStatusMap = {},
  selectedPath = "",
  expandedPaths: ReadonlySet<string> = new Set(),
): FileTreeNode[] {
  return nodes.map((node) => decorateNode(node, statusMap, selectedPath, expandedPaths));
}

export function isDirtyStatus(status: GitFileStatus | string | undefined): boolean {
  return DIRTY_STATUSES.has(normalizeGitStatus(status));
}

function decorateNode(
  node: RawFileNode,
  statusMap: GitStatusMap,
  selectedPath: string,
  expandedPaths: ReadonlySet<string>,
): FileTreeNode {
  const path = normalizePath(node.path || node.name);
  const children = (node.children || []).map((child) => decorateNode(child, statusMap, selectedPath, expandedPaths));
  const gitStatus = normalizeGitStatus(statusMap[path] || node.status);
  const dirtyDescendants = children.some((child) => isDirtyStatus(child.gitStatus) || child.dirtyDescendants);
  const kind = node.type === "dir" ? "dir" : "file";
  return {
    id: path || node.name,
    name: node.name,
    path,
    kind,
    children: children.length ? children : undefined,
    gitStatus,
    dirtyDescendants,
    selected: path === selectedPath,
    expanded: Boolean(node.open || expandedPaths.has(path)),
  };
}

function normalizeGitStatus(status: GitFileStatus | string | undefined): GitFileStatus {
  if (status === "modified" || status === "added" || status === "untracked" || status === "deleted" || status === "renamed") {
    return status;
  }
  return "clean";
}

function normalizePath(path: string): string {
  return String(path || "").replace(/^\.\//, "").replace(/\\/g, "/");
}
