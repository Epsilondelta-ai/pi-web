import React, { useEffect, useMemo, useState } from "react";
import { Tree } from "react-arborist";
import { decorateFileTree, type FileTreeNode, type GitStatusMap, type RawFileNode } from "../file-tree-model";

type WorkspaceTreeUpdate = {
  files?: RawFileNode[];
  statusMap?: GitStatusMap;
  selectedPath?: string;
};

type Props = {
  initialFiles?: RawFileNode[];
  initialStatusMap?: GitStatusMap;
};

const ROW_HEIGHT = 24;
const DEFAULT_HEIGHT = 480;

export default function WorkspaceFileTree({ initialFiles = [], initialStatusMap = {} }: Props) {
  const [files, setFiles] = useState<RawFileNode[]>(initialFiles);
  const [statusMap, setStatusMap] = useState<GitStatusMap>(initialStatusMap);
  const [selectedPath, setSelectedPath] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceTreeUpdate>).detail || {};
      setFiles(detail.files || []);
      setStatusMap(detail.statusMap || {});
      setSelectedPath(detail.selectedPath || "");
    };
    window.addEventListener("pi-workspace-tree:update", onUpdate);
    return () => window.removeEventListener("pi-workspace-tree:update", onUpdate);
  }, []);

  useEffect(() => {
    const container = document.querySelector(".tree-list");
    if (!container || typeof ResizeObserver === "undefined") return;
    const resize = () => setHeight(Math.max(120, Math.floor(container.getBoundingClientRect().height || DEFAULT_HEIGHT)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const data = useMemo(
    () => decorateFileTree(files, statusMap, selectedPath, expandedPaths),
    [expandedPaths, files, selectedPath, statusMap],
  );

  if (!files.length) {
    return <div className="tree-empty">file tree loads from backend.</div>;
  }

  return (
    <div className="tree-arborist" data-testid="workspace-file-tree">
      <Tree<FileTreeNode>
        data={data}
        width="100%"
        height={height}
        rowHeight={ROW_HEIGHT}
        indent={14}
        overscanCount={8}
        idAccessor="id"
        childrenAccessor="children"
        openByDefault={false}
        selection={selectedPath || undefined}
        disableDrag
        disableDrop
        disableEdit
        onToggle={(id) => {
          setExpandedPaths((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }}
      >
        {FileTreeRow}
      </Tree>
      <div className="tree-tip">tip: pi watches the tree · changes appear here.</div>
    </div>
  );
}

function FileTreeRow({ node, style, dragHandle }: any) {
  const item = node.data as FileTreeNode;
  const isDir = item.kind === "dir";
  const status = item.gitStatus !== "clean" ? item.gitStatus : item.dirtyDescendants ? "dirty" : "clean";
  const classes = ["tree-node", item.kind, status, node.isSelected && "selected"].filter(Boolean).join(" ");
  const glyph = isDir ? (node.isOpen ? "▾" : "▸") : "·";

  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isDir) {
      event.preventDefault();
      node.toggle();
      return;
    }
    node.select();
  };

  return (
    <button
      ref={dragHandle}
      style={style}
      type="button"
      className={classes}
      data-action={isDir ? "toggle-tree-node-react" : "open-file"}
      data-file-path={item.path}
      aria-expanded={isDir ? node.isOpen : undefined}
      aria-current={node.isSelected ? "true" : undefined}
      title={item.path}
      onClick={onClick}
    >
      <span className="glyph">{glyph}</span>
      <span className="name">{item.name}</span>
      <StatusBadge status={status} />
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "clean") return null;
  const label = statusLabels[status] || "•";
  return <span className="tree-status-badge" aria-label={status}>{label}</span>;
}

const statusLabels: Record<string, string> = {
  modified: "M",
  added: "A",
  untracked: "U",
  deleted: "D",
  renamed: "R",
  dirty: "•",
};
