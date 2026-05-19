import {
  getGitStatus,
  getSession,
  getWorkspaceCommands,
  getWorkspaceFiles,
  getWorkspaces,
} from "../api";
import { renderTree } from "../renderers";
import { readStoredActiveSession, storeActiveSession } from "./session-storage";

function findStoredSession(workspaces, stored) {
  if (!stored?.sessionId) return undefined;
  const preferred = workspaces.find((workspace) => workspace.id === stored.workspaceId);
  const candidates = preferred
    ? [preferred, ...workspaces.filter((workspace) => workspace !== preferred)]
    : workspaces;

  for (const workspace of candidates) {
    const session = workspace.sessions?.find((item) => item.id === stored.sessionId);
    if (session) return { workspace, session };
  }
  return undefined;
}

export const workspaceBootstrapMethods = {
  async bootstrapAPI() {
    try {
      const [{ workspaces }] = await Promise.all([getWorkspaces()]);
      this.apiConnected = true;
      this.setConnection("ok");

      const workspaceList = workspaces || [];
      const storedSession = findStoredSession(workspaceList, readStoredActiveSession());
      const activeWorkspace = storedSession?.workspace || workspaceList[0];
      const activeSession = storedSession?.session || activeWorkspace?.sessions?.[0];

      if (activeWorkspace) this.activateBootstrapWorkspace(activeWorkspace);
      if (activeSession) this.activateBootstrapSession(activeSession);

      this.renderWorkspaces(workspaceList);
      void this.loadVersionStatus?.();
      if (activeSession) this.route("workspace");
      else if (this.dataset.route === "picker") await this.browseFolder();

      if (activeWorkspace) {
        void this.loadWorkspaceCommands(activeWorkspace.id);
        void this.loadRuntimeStatus(activeWorkspace.id);
        await this.loadWorkspaceMeta(activeWorkspace.id);
      }
      if (activeSession) await this.loadSession(activeSession.id);
    } catch {
      this.apiConnected = false;
      this.setConnection("err");
    }
  },

  activateBootstrapWorkspace(workspace) {
    this.dataset.activeWorkspaceId = workspace.id;
    const label = this.querySelector("[data-active-workspace]");
    if (label) label.textContent = workspace.name;
  },

  activateBootstrapSession(session) {
    this.dataset.activeSessionId = session.id;
    const title = this.querySelector("[data-active-session-title]");
    if (title) {
      title.textContent = session.title;
      title.title = `${session.title} · ${session.id}`;
    }
  },

  async loadWorkspaceMeta(workspaceId) {
    try {
      const [{ files }, git] = await Promise.all([getWorkspaceFiles(workspaceId), getGitStatus(workspaceId)]);
      this.renderWorkspaceTree(files);
      this.renderGitStatus(git);
    } catch {}
  },

  renderWorkspaceTree(files) {
    const list = this.querySelector(".tree-list");
    if (!list || !files) return;
    const tip = "<div style=\"padding:8px 16px;color:var(--fg-4);font-size:11px;font-style:italic\">";
    list.innerHTML = `${renderTree(files)}${tip}tip: pi watches the tree · changes appear here.</div>`;
  },

  renderGitStatus(git) {
    const status = this.querySelector("[data-git-status]");
    if (status && git) status.textContent = `${git.branch} · ${git.dirty} ✱`;
    if (git?.branch) this.updatePromptMeta({ currentBranch: git.branch });
  },

  async loadWorkspaceCommands(workspaceId) {
    try {
      const { commands } = await getWorkspaceCommands(workspaceId);
      this.renderSlashCommands(commands || []);
    } catch {}
  },

  async refreshWorkspaces() {
    if (!this.apiConnected) return;
    const button = this.querySelector("[data-action='refresh-workspaces']");
    if (button) button.disabled = true;
    try {
      const { workspaces } = await getWorkspaces();
      const workspaceList = workspaces || [];
      const activeWorkspaceId = this.dataset.activeWorkspaceId;
      this.renderWorkspaces(workspaceList);
      if (activeWorkspaceId) this.openActiveWorkspaceGroup(activeWorkspaceId);
    } catch {
      this.setConnection("err");
    } finally {
      if (button) button.disabled = false;
    }
  },

  async refreshTree() {
    const workspaceId = this.dataset.activeWorkspaceId;
    if (!workspaceId || !this.apiConnected) return;
    const button = this.querySelector("[data-action='refresh-tree']");
    if (button) button.disabled = true;
    try {
      await this.loadWorkspaceMeta(workspaceId);
    } finally {
      if (button) button.disabled = false;
    }
  },

  async loadSession(sessionId) {
    const loadToken = Symbol(sessionId);
    this.sessionLoadToken = loadToken;
    try {
      const { session, messages, status } = await getSession(sessionId);
      if (this.sessionLoadToken !== loadToken) return;
      this.applyLoadedSession(session, messages || [], status);
    } catch {
      if (this.sessionLoadToken === loadToken) this.setConnection("err");
    }
  },

  applyLoadedSession(session, messages, status = "idle") {
    this.dataset.activeSessionId = session.id;
    this.resetActiveSessionState?.();
    const workspaceId = session.workspaceId
      || this.findSessionRow(session.id)?.dataset.workspace;
    if (workspaceId) this.activateWorkspaceForSession(workspaceId);
    storeActiveSession(workspaceId || this.dataset.activeWorkspaceId, session.id);
    this.activateBootstrapSession(session);
    this.renderMessages(messages);
    this.setMode(status || "idle");
    this.connectEvents(session.id, { replay: false });
  },

  findSessionRow(sessionId) {
    return [...this.querySelectorAll("[data-session]")].find((row) => row.dataset.session === sessionId);
  },

  findWorkspaceGroup(workspaceId) {
    return [...this.querySelectorAll("[data-workspace-group]")]
      .find((group) => group.dataset.workspaceGroup === workspaceId);
  },

  activateWorkspaceForSession(workspaceId) {
    const changed = this.dataset.activeWorkspaceId !== workspaceId;
    this.dataset.activeWorkspaceId = workspaceId;
    this.openActiveWorkspaceGroup(workspaceId);
    this.updateActiveWorkspaceLabel(workspaceId);
    if (!changed) return;
    void this.loadWorkspaceCommands(workspaceId);
    void this.loadRuntimeStatus(workspaceId);
    void this.loadWorkspaceMeta(workspaceId);
  },

  openActiveWorkspaceGroup(workspaceId) {
    this.querySelectorAll("[data-workspace-group]").forEach((group) => {
      const open = group.dataset.workspaceGroup === workspaceId;
      const sessions = group.querySelector(".sessions");
      const row = group.querySelector(".ws-row");
      if (sessions) sessions.hidden = !open;
      row?.classList.toggle("open", open);
      row?.setAttribute("aria-expanded", String(open));
      const caret = row?.querySelector(".caret");
      if (caret) caret.textContent = open ? "▾" : "▸";
    });
  },

  updateActiveWorkspaceLabel(workspaceId) {
    const group = this.findWorkspaceGroup(workspaceId);
    const name = group?.querySelector(".label")?.textContent || workspaceId;
    const label = this.querySelector("[data-active-workspace]");
    const empty = this.querySelector("[data-empty-workspace]");
    if (label) label.textContent = name;
    if (empty) empty.textContent = name;
  },
};
