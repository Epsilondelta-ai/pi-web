import materialIcons from "material-icon-theme/dist/material-icons.json";
import fileIconUrl from "material-icon-theme/icons/file.svg?url";
import folderIconUrl from "material-icon-theme/icons/folder.svg?url";
import folderOpenIconUrl from "material-icon-theme/icons/folder-open.svg?url";

type IconDefinition = { iconPath?: string };
type MaterialIconManifest = {
  iconDefinitions: Record<string, IconDefinition | undefined>;
  folderNames: Record<string, string | undefined>;
  folderNamesExpanded: Record<string, string | undefined>;
  fileExtensions: Record<string, string | undefined>;
  fileNames: Record<string, string | undefined>;
  file?: string;
  folder?: string;
  folderExpanded?: string;
};

export type MaterialFileIcon = { name: string; url: string };

const manifest = materialIcons as MaterialIconManifest;

export function resolveMaterialFileIcon(input: { name: string; path?: string; kind: "file" | "dir"; open?: boolean }): MaterialFileIcon {
  const iconName = input.kind === "dir" ? resolveFolderIcon(input.name, input.open) : resolveFileIcon(input.name, input.path);
  return { name: iconName, url: iconUrl(iconName) };
}

function resolveFolderIcon(name: string, open = false): string {
  const folderName = normalizeName(name);
  const folderIcons = open ? manifest.folderNamesExpanded : manifest.folderNames;
  const specificIcon = folderIcons[folderName];
  if (specificIcon) return specificIcon;
  return open ? "folder-open" : "folder";
}

function resolveFileIcon(name: string, path = ""): string {
  const basename = normalizeName(name || path.split("/").pop() || "");
  const exactName = manifest.fileNames[basename];
  if (exactName) return exactName;
  for (const extension of extensionCandidates(basename)) {
    const icon = manifest.fileExtensions[extension];
    if (icon === undefined) continue;
    return icon;
  }
  return manifest.file;
}

function extensionCandidates(basename: string): string[] {
  const parts = basename.split(".").filter(Boolean);
  if (parts.length <= 1) return [];
  return parts.slice(1).map((_, index) => parts.slice(index + 1).join(".")).sort((a, b) => b.length - a.length);
}

function iconUrl(iconName: string): string {
  if (iconName === "folder") return folderIconUrl;
  if (iconName === "folder-open") return folderOpenIconUrl;
  return fileIconUrl;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
