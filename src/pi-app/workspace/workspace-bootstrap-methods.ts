import {
  getGitStatus,
  getSession,
  getWorkspaceCommands,
  getWorkspaceFiles,
  getWorkspaces,
} from "../../lib/api";
import { readStoredActiveSession, storeActiveSession } from "../sessions/session-storage";

const SESSION_MESSAGE_PAGE_SIZE = 120;

function parseInitialTreeFiles(raw) {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

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
        void (this.loadWorkspaceSettingsState?.(activeWorkspace.id))?.catch?.(() => undefined);
      }
      if (activeSession) await this.loadSession(activeSession.id);
      if (activeWorkspace && this.dataset.tree === "on") void this.loadWorkspaceMeta(activeWorkspace.id);
    } catch {
      this.apiConnected = false;
      this.setConnection("err");
    }
  },

  activateBootstrapWorkspace(workspace) {
    this.dataset.activeWorkspaceId = workspace.id;
    const label = this.querySelector("[data-active-workspace]");
    if (label) label.textContent = workspace.name;
    this.syncActiveWorkspaceRows?.();
  },

  activateBootstrapSession(session) {
    this.dataset.activeSessionId = session.id;
    const title = this.querySelector("[data-active-session-title]");
    if (title) {
      title.textContent = session.title;
      title.title = `${session.title} · ${session.id}`;
    }
  },

  async loadWorkspaceMeta(workspaceId, options: any = {}) {
    const token = Symbol(workspaceId);
    this.workspaceMetaLoadToken = token;
    try {
      const [{ files }, git] = await Promise.all([getWorkspaceFiles(workspaceId), getGitStatus(workspaceId)]);
      if (this.workspaceMetaLoadToken !== token || this.dataset.activeWorkspaceId !== workspaceId) return;
      this.workspaceMetaLoadedFor = this.workspaceMetaLoadedFor || new Set();
      this.workspaceMetaLoadedFor.add(workspaceId);
      this.renderWorkspaceTree(files, git?.files || {}, options.selectedPath);
      this.renderGitStatus(git);
    } catch {}
  },

  async ensureWorkspaceTreeMounted() {
    const root = this.querySelector("[data-workspace-tree-root]");
    if (!root || this.workspaceTreeMounted || this.workspaceTreeMounting) return;
    this.workspaceTreeMounting = true;
    try {
      const [{ default: React }, { createRoot }, { default: WorkspaceFileTree }] = await Promise.all([
        import("react"),
        import("react-dom/client"),
        import("../../components/WorkspaceFileTree"),
      ]);
      if (!root.isConnected || this.workspaceTreeMounted) return;
      const initialFiles = this.workspaceFiles || parseInitialTreeFiles(root.dataset.initialFiles);
      const initialStatusMap = this.workspaceFileStatuses || {};
      this.workspaceTreeRoot = createRoot(root);
      this.workspaceTreeRoot.render(React.createElement(WorkspaceFileTree, { initialFiles, initialStatusMap }));
      this.workspaceTreeMounted = true;
    } finally {
      this.workspaceTreeMounting = false;
    }
  },

  renderWorkspaceTree(files, statusMap = {}, selectedPathOverride = undefined) {
    if (!files) return;
    this.workspaceFiles = files;
    this.workspaceFileStatuses = statusMap;
    const selectedPath = selectedPathOverride ?? (this.filePreview?.file?.path || "");
    window.dispatchEvent(new CustomEvent("pi-workspace-tree:update", {
      detail: { files, statusMap, selectedPath },
    }));
  },

  renderGitStatus(git) {
    const status = this.querySelector("[data-git-status]");
    if (status && git) status.textContent = `${git.branch} · ${git.dirty} ✱`;
    if (git?.branch) this.updatePromptMeta({ currentBranch: git.branch });
  },

  async loadWorkspaceCommands(workspaceId, options: any = {}) {
    try {
      const { commands, diagnostics } = await getWorkspaceCommands(workspaceId, { reload: !!options.reload });
      if (diagnostics?.length) this.renderSlashCommands(commands || [], diagnostics);
      else this.renderSlashCommands(commands || []);
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
    this.showSessionSwitchLoading(sessionId);
    try {
      const loaded = await getSession(sessionId, { limit: SESSION_MESSAGE_PAGE_SIZE });
      if (this.sessionLoadToken !== loadToken) return;
      this.applyLoadedSession(loaded.session, loaded.messages || [], loaded.status, loaded);
    } catch {
      if (this.sessionLoadToken === loadToken) this.setConnection("err");
    }
  },

  showSessionSwitchLoading(sessionId) {
    if (!this.termInner) return;
    this.resetActiveSessionState?.();
    this.termInner.replaceChildren();
    this.resetTranscriptWindow?.();
    const row = this.simpleMessage("session loading", "pi >", "");
    row.classList.add("session-switch-loading");
    row.dataset.kind = "loading";
    const label = document.createElement("span");
    label.className = "session-switch-label";
    label.textContent = `loading ${this.findSessionRow(sessionId)?.dataset.title || "session"}…`;
    const skeleton = document.createElement("span");
    skeleton.className = "session-switch-skeleton";
    skeleton.setAttribute("aria-hidden", "true");
    row.querySelector(".body")?.replaceChildren(label, skeleton);
    this.appendTranscriptNode?.(row, { stickToBottom: false });
  },

  applyLoadedSession(session, messages, status = "idle", page: any = {}) {
    this.dataset.activeSessionId = session.id;
    this.resetActiveSessionState?.();
    const workspaceId = session.workspaceId
      || this.findSessionRow(session.id)?.dataset.workspace;
    if (workspaceId) this.activateWorkspaceForSession(workspaceId, { loadContext: true });
    this.markSelectedSessionRow?.(session.id);
    storeActiveSession(workspaceId || this.dataset.activeWorkspaceId, session.id);
    this.activateBootstrapSession(session);
    this.sessionHistoryCursor = page.cursor || "";
    this.sessionHistoryHasMore = !!page.hasMore;
    this.sessionHistoryLoading = false;
    this.renderMessages(messages);
    this.setMode(status || "idle");
    this.connectEvents(session.id, { replay: false });
  },

  async loadOlderSessionMessages() {
    const sessionId = this.dataset.activeSessionId;
    if (!sessionId || !this.sessionHistoryHasMore || this.sessionHistoryLoading) return;
    this.sessionHistoryLoading = true;
    const cursor = this.sessionHistoryCursor;
    try {
      const loaded = await getSession(sessionId, { limit: SESSION_MESSAGE_PAGE_SIZE, before: cursor });
      if (this.dataset.activeSessionId !== sessionId || this.sessionHistoryCursor !== cursor) return;
      this.prependLoadedMessages(loaded.messages || []);
      this.sessionHistoryCursor = loaded.cursor || "";
      this.sessionHistoryHasMore = !!loaded.hasMore;
    } catch {
      this.setConnection("err");
    } finally {
      if (this.dataset.activeSessionId === sessionId) this.sessionHistoryLoading = false;
    }
  },

  prependLoadedMessages(messages) {
    if (!messages.length) return;
    this.answeredChoiceIds = new Set([
      ...(this.answeredChoiceIds || []),
      ...this.answeredChoiceIdsFrom(messages),
    ]);
    this.transcriptItems = [
      ...messages.map((message) => this.createTranscriptItem(message)),
      ...(this.transcriptItems || []),
    ];
    this.renderTranscriptWindow({ stickToBottom: false, preservePrepend: true });
  },

  findSessionRow(sessionId) {
    return [...this.querySelectorAll("[data-session]")].find((row) => row.dataset.session === sessionId);
  },

  findWorkspaceGroup(workspaceId) {
    return [...this.querySelectorAll("[data-workspace-group]")]
      .find((group) => group.dataset.workspaceGroup === workspaceId);
  },

  activateWorkspaceForSession(workspaceId, { loadContext = false, forceLoadContext = false } = {}) {
    const changed = this.dataset.activeWorkspaceId !== workspaceId;
    this.dataset.activeWorkspaceId = workspaceId;
    this.openActiveWorkspaceGroup(workspaceId);
    this.updateActiveWorkspaceLabel(workspaceId);
    this.syncActiveWorkspaceRows?.();
    const shouldLoadContext = loadContext && (changed || forceLoadContext);
    if (this.apiConnected && shouldLoadContext) this.loadWorkspaceContext(workspaceId);
  },

  loadWorkspaceContext(workspaceId) {
    void this.loadWorkspaceCommands(workspaceId);
    void this.loadRuntimeStatus(workspaceId);
    void (this.loadWorkspaceSettingsState?.(workspaceId))?.catch?.(() => undefined);
    void (this.loadWorkspacePackageStatus?.(workspaceId))?.catch?.(() => undefined);
    if (this.dataset.tree === "on") void this.loadWorkspaceMeta(workspaceId);
  },

  openActiveWorkspaceGroup(workspaceId) {
    this.querySelectorAll("[data-workspace-group]").forEach((group) => {
      const open = group.dataset.workspaceGroup === workspaceId;
      const sessions = group.querySelector(".sessions");
      const row = group.querySelector(".ws-row");
      if (sessions) sessions.hidden = !open;
      row?.classList.toggle("open", open);
      row?.setAttribute("aria-expanded", String(open));
    });
    window.dispatchEvent(new CustomEvent("pi-sidebar-workspace-state", {
      detail: { activeWorkspaceId: this.dataset.activeWorkspaceId || "", openWorkspaceId: workspaceId || "" },
    }));
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
