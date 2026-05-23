import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tree } from "react-arborist";
import {
  createWorkspaceFile,
  deleteWorkspaceFile,
  renameWorkspaceFile,
  uploadWorkspaceFile,
} from "../lib/api";
import { decorateFileTree, type FileTreeNode, type GitStatusMap, type RawFileNode } from "../lib/file-tree-model";
import { resolveMaterialFileIcon } from "../lib/material-file-icons";

type WorkspaceTreeUpdate = { files?: RawFileNode[]; statusMap?: GitStatusMap; selectedPath?: string };
type Props = { initialFiles?: RawFileNode[]; initialStatusMap?: GitStatusMap };
type MenuTarget = { x: number; y: number; path: string; kind: "file" | "dir" | "root" };

const ROW_HEIGHT = 38;
const DEFAULT_HEIGHT = 480;

export default function WorkspaceFileTree({ initialFiles = [], initialStatusMap = {} }: Props) {
  const [files, setFiles] = useState<RawFileNode[]>(initialFiles);
  const [statusMap, setStatusMap] = useState<GitStatusMap>(initialStatusMap);
  const [selectedPath, setSelectedPath] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<MenuTarget | null>(null);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceTreeUpdate>).detail || {};
      setFiles(detail.files || []);
      setStatusMap(detail.statusMap || {});
      setSelectedPath(detail.selectedPath || "");
    };
    const onRootMenu = (event: Event) => {
      const detail = (event as CustomEvent<{ x?: number; y?: number }>).detail || {};
      setMenu({ x: detail.x || 24, y: detail.y || 88, path: "", kind: "root" });
    };
    window.addEventListener("pi-workspace-tree:update", onUpdate);
    window.addEventListener("pi-workspace-tree:root-menu", onRootMenu);
    return () => {
      window.removeEventListener("pi-workspace-tree:update", onUpdate);
      window.removeEventListener("pi-workspace-tree:root-menu", onRootMenu);
    };
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

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  const data = useMemo(
    () => decorateFileTree(files, statusMap, selectedPath, expandedPaths),
    [expandedPaths, files, selectedPath, statusMap],
  );

  const contextValue = useMemo(() => ({ setMenu }), []);

  const onEmptyContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest?.(".tree-node")) return;
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, path: "", kind: "root" });
  };

  return (
    <TreeContext.Provider value={contextValue}>
      <div className="tree-arborist" data-testid="workspace-file-tree" onContextMenu={onEmptyContextMenu}>
        {!files.length ? (
          <div className="tree-empty">file tree loads from backend.</div>
        ) : (
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
        )}
        <input
          ref={uploadInput}
          type="file"
          multiple
          hidden
          onChange={(event) => void uploadFiles(event.currentTarget.files)}
        />
        {menu && <TreeActionMenu target={menu} onAction={(action) => void runAction(action, menu)} />}
        <div className="tree-tip">tip: right-click or tap ⋯ for file actions.</div>
      </div>
    </TreeContext.Provider>
  );

  async function runAction(action: string, target: MenuTarget) {
    setMenu(null);
    const workspaceId = activeWorkspaceId();
    if (!workspaceId) return;
    try {
      if (action === "new-file" || action === "new-folder") {
        const parent = uploadFolder(target);
        const label = action === "new-file" ? "New file path" : "New folder path";
        const name = window.prompt(label, joinPath(parent, action === "new-file" ? "untitled.txt" : "new-folder"));
        if (!name) return;
        await createWorkspaceFile(workspaceId, name, action === "new-file" ? "file" : "dir");
        refreshTree(action === "new-file" ? name : "");
      }
      if (action === "rename" && target.kind !== "root") {
        const nextPath = window.prompt("Rename path", target.path);
        if (!nextPath || nextPath === target.path) return;
        await renameWorkspaceFile(workspaceId, target.path, nextPath);
        refreshTree(nextPath);
      }
      if (action === "delete" && target.kind !== "root") {
        if (!window.confirm(`Delete ${target.path}?`)) return;
        await deleteWorkspaceFile(workspaceId, target.path);
        refreshTree("");
      }
      if (action === "upload") {
        uploadTarget.current = target;
        uploadInput.current?.click();
      }
    } catch (error) {
      showTemporaryError(error);
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    const workspaceId = activeWorkspaceId();
    const target = uploadTarget.current;
    const selectedFiles = fileList ? Array.from(fileList) : [];
    uploadTarget.current = null;
    if (uploadInput.current) uploadInput.current.value = "";
    if (!workspaceId || !target || !selectedFiles.length) return;
    const folder = uploadFolder(target);
    let firstPath = "";
    try {
      for (const file of selectedFiles) {
        const path = joinPath(folder, file.name);
        const content = await fileToBase64(file);
        try {
          await uploadWorkspaceFile(workspaceId, path, content, false);
        } catch (error) {
          if (!isAlreadyExistsError(error) || !window.confirm(`${path} already exists. Overwrite?`)) throw error;
          await uploadWorkspaceFile(workspaceId, path, content, true);
        }
        if (!firstPath) firstPath = path;
      }
      refreshTree(firstPath);
    } catch (error) {
      showTemporaryError(error);
      refreshTree(firstPath);
    }
  }
}

const TreeContext = React.createContext<{ setMenu: (target: MenuTarget) => void }>({ setMenu: () => {} });

function FileTreeRow({ node, style, dragHandle }: any) {
  const { setMenu } = React.useContext(TreeContext);
  const item = node.data as FileTreeNode;
  const isDir = item.kind === "dir";
  const status = item.gitStatus !== "clean" ? item.gitStatus : item.dirtyDescendants ? "dirty" : "clean";
  const classes = ["tree-node", item.kind, status, node.isSelected && "selected"].filter(Boolean).join(" ");
  const glyph = isDir ? (node.isOpen ? "▾" : "▸") : "";
  const icon = resolveMaterialFileIcon({ name: item.name, path: item.path, kind: item.kind, open: node.isOpen });

  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if ((event.target as Element).closest(".tree-row-menu")) return;
    if (isDir) {
      event.preventDefault();
      node.toggle();
      return;
    }
    node.select();
  };
  const onContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, path: item.path, kind: isDir ? "dir" : "file" });
  };
  const onMenuClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: rect.left, y: rect.bottom, path: item.path, kind: isDir ? "dir" : "file" });
  };

  return (
    <button
      ref={dragHandle}
      style={style}
      type="button"
      className={classes}
      data-action={isDir ? undefined : "open-file"}
      data-file-path={item.path}
      aria-expanded={isDir ? node.isOpen : undefined}
      aria-current={node.isSelected ? "true" : undefined}
      title={item.path}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <span className="glyph">{glyph}</span>
      <span className="file-icon" data-icon-name={icon.name}>
        <img src={icon.url} alt="" aria-hidden="true" draggable={false} />
      </span>
      <span className="name">{item.name}</span>
      <StatusBadge status={status} />
      <span className="tree-row-menu" role="button" tabIndex={0} aria-label={`actions for ${item.name}`} onClick={onMenuClick}>⋯</span>
    </button>
  );
}

function TreeActionMenu({ target, onAction }: { target: MenuTarget; onAction: (action: string) => void }) {
  const canTarget = target.kind !== "root";
  const style = menuPosition(target);
  return (
    <div className="tree-action-menu" style={style} onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => onAction("new-file")}>new file</button>
      <button type="button" onClick={() => onAction("new-folder")}>new folder</button>
      <button type="button" onClick={() => onAction("upload")}>upload here</button>
      <button type="button" disabled={!canTarget} onClick={() => onAction("rename")}>rename</button>
      <button type="button" disabled={!canTarget} className="danger" onClick={() => onAction("delete")}>delete</button>
    </div>
  );
}

function menuPosition(target: MenuTarget) {
  const width = 168;
  const height = 180;
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    left: Math.min(Math.max(margin, target.x), maxX),
    top: Math.min(Math.max(margin, target.y), maxY),
  };
}

function StatusBadge({ status }: { status: string }) {
  if (status === "clean") return null;
  const label = statusLabels[status] || "•";
  return <span className="tree-status-badge" aria-label={status}>{label}</span>;
}

function showTemporaryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  window.alert(message);
}

function activeWorkspaceId() {
  return document.querySelector<HTMLElement>("pi-app")?.dataset.activeWorkspaceId || "";
}

function refreshTree(selectedPath: string) {
  window.dispatchEvent(new CustomEvent("pi-workspace-tree:refresh", { detail: { selectedPath } }));
  if (selectedPath) window.dispatchEvent(new CustomEvent("pi-workspace-file:open", { detail: { path: selectedPath } }));
}

function uploadFolder(target: MenuTarget) {
  if (target.kind === "root") return "";
  if (target.kind === "dir") return target.path;
  return parentPath(target.path);
}

function parentPath(path: string) {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : "";
}

function joinPath(parent: string, name: string) {
  return [parent, name].filter(Boolean).join("/").replace(/\/+/g, "/");
}

function isAlreadyExistsError(error: unknown) {
  return String(error instanceof Error ? error.message : error).toLowerCase().includes("already exists");
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("file read failed"));
    reader.onload = () => resolve(String(reader.result || "").split(",").pop() || "");
    reader.readAsDataURL(file);
  });
}

const statusLabels: Record<string, string> = {
  modified: "M",
  added: "A",
  untracked: "U",
  deleted: "D",
  renamed: "R",
  dirty: "•",
};
