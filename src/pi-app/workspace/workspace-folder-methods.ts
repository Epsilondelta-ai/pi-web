import {
  cloneWorkspace as cloneWorkspaceRequest,
  deleteWorkspace as deleteWorkspaceRequest,
  getWorkspaces,
  listFolders,
  openWorkspace as openWorkspaceRequest,
} from "../../lib/api";

export const workspaceFolderMethods = {
  async browseFolder() {
    this.querySelector("[data-folder-browser]")?.removeAttribute("hidden");
    await this.loadFolder(this.currentFolder || "~");
  },

  async loadFolder(path = "~") {
    if (!this.apiConnected) {
      this.setConnection("err");
      return;
    }

    try {
      const listing = await listFolders(path || "~");
      this.currentFolder = listing.path;
      this.currentFolderParent = listing.parent || listing.path;
      this.renderFolderListing(listing);
    } catch {
      this.setConnection("err");
    }
  },

  renderFolderListing(listing) {
    const input = this.querySelector('[data-path-form] input[name="path"]');
    if (input) input.value = listing.path;
    const label = this.querySelector("[data-folder-path]");
    if (label) label.textContent = listing.displayPath || listing.path;
    const list = this.querySelector("[data-folder-list]");
    if (!list) return;
    list.replaceChildren();
    for (const folder of listing.folders || []) list.append(this.folderRow(folder));
    if (!listing.folders?.length) list.append(this.emptyFolderRow());
  },

  emptyFolderRow() {
    const empty = document.createElement("div");
    empty.className = "folder-empty";
    empty.textContent = "no folders";
    return empty;
  },

  folderRow(folder) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "folder-row";
    row.dataset.action = "folder-enter";
    row.dataset.path = folder.path;
    row.innerHTML = `<span>▸</span><span class="folder-name"></span><span class="folder-path"></span>`;
    row.querySelector(".folder-name").textContent = folder.name;
    row.querySelector(".folder-path").textContent = folder.displayPath || folder.path;
    return row;
  },

  async openWorkspacePath(path) {
    if (!path) return;
    await openWorkspaceRequest(path);
    const { workspaces } = await getWorkspaces();
    this.renderWorkspaces(workspaces || []);
    const workspace = (workspaces || []).find((item) => item.path === path) || workspaces?.[0];
    if (workspace) await this.openWorkspace(workspace.id);
  },

  async submitCloneWorkspace(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const gitUrl = form.querySelector("input[name='gitUrl']")?.value.trim();
    const name = form.querySelector("input[name='name']")?.value.trim() || "";
    if (!gitUrl || !this.apiConnected) return;

    const button = form.querySelector("button[type='submit']");
    if (button) button.disabled = true;
    try {
      const cloned = await cloneWorkspaceRequest(this.currentFolder || "~", gitUrl, name);
      form.reset();
      const { workspaces } = await getWorkspaces();
      this.renderWorkspaces(workspaces || []);
      const workspace = cloned.workspace || workspaces?.[0];
      if (workspace) await this.openWorkspace(workspace.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
      this.setConnection("err");
    } finally {
      if (button) button.disabled = false;
    }
  },

  async submitWorkspacePath(event) {
    event.preventDefault();
    const input = event.currentTarget.querySelector("input[name='path']");
    const path = input?.value.trim();
    if (!path) return;
    if (this.apiConnected) {
      try {
        await this.openWorkspacePath(path);
        return;
      } catch {
        this.setConnection("err");
      }
    }
    this.route("workspace");
  },

  async deleteWorkspace(workspaceId) {
    if (!workspaceId || !this.apiConnected) return;
    if (!confirm(`Remove workspace ${workspaceId} from this view?`)) return;
    try {
      await deleteWorkspaceRequest(workspaceId);
      const { workspaces } = await getWorkspaces();
      this.renderWorkspaces(workspaces || []);
    } catch {
      this.setConnection("err");
    }
  },

  async openWorkspace(workspaceId) {
    this.activateWorkspaceForSession(workspaceId, { loadContext: true, forceLoadContext: true });
    this.route("workspace");
  },
};
