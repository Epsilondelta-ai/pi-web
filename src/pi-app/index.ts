import { applyUiLocale, currentUiLocale, setUiLocale } from "../i18n/client";
import { normalizeUiLocale } from "../i18n/locales";
import { deleteWorkspace, openWorkspace } from "../shared/api/api";
import { pluginMethods } from "./plugins/plugin-methods";
import { oauthMethods } from "./settings/oauth-methods";
import { settingsMethods } from "./settings/settings-methods";

type WorkspaceSummary = { id: string; name?: string; path?: string; sessions?: unknown[]; sessionCount?: number };
type PiAppElement = HTMLElement & { apiConnected: boolean; bound?: boolean; workspaceList: WorkspaceSummary[]; settingsModal?: HTMLElement | null; [key: string]: unknown };

const automaticStartupDisabled = (): boolean => {
  const testGlobal: typeof globalThis & { __PI_WEB_DISABLE_AUTOMATIC_STARTUP__?: boolean } = globalThis;
  return testGlobal.__PI_WEB_DISABLE_AUTOMATIC_STARTUP__ === true;
};

const pluginAutoloadDisabled = (): boolean => {
  const testGlobal: typeof globalThis & { __PI_WEB_DISABLE_PLUGIN_AUTOLOAD__?: boolean } = globalThis;
  return testGlobal.__PI_WEB_DISABLE_PLUGIN_AUTOLOAD__ === true;
};

function initialWorkspacesFromDataset(app: HTMLElement): WorkspaceSummary[] {
  try {
    const parsed: unknown = JSON.parse(app.dataset.initialWorkspaces || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((workspace: unknown): workspace is WorkspaceSummary => {
      return !!workspace && typeof workspace === "object" && typeof (workspace as WorkspaceSummary).id === "string";
    });
  } catch {
    return [];
  }
}

class PiApp extends HTMLElement {
  connectedCallback(): void {
    const host: PiAppElement = this as unknown as PiAppElement;
    if (host.bound) return;
    host.bound = true;
    host.apiConnected = true;
    host.workspaceList = initialWorkspacesFromDataset(this);
    host.settingsModal = this.querySelector("[data-settings-modal]");
    applyUiLocale(currentUiLocale(), this);
    this.bindDomEvents();
    if (!automaticStartupDisabled()) void this.startApplication();
  }

  disconnectedCallback(): void {
    void (this as unknown as { deactivateLoadedPlugins?: () => Promise<void> }).deactivateLoadedPlugins?.();
  }

  async startApplication(): Promise<void> {
    if (!pluginAutoloadDisabled()) {
      await (this as unknown as { loadPlugins?: () => Promise<void> }).loadPlugins?.().catch((): undefined => undefined);
    }
  }

  bindDomEvents(): void {
    this.addEventListener("click", (event: MouseEvent): void => this.handleAppClick(event));
    this.querySelector("[data-settings-form]")?.addEventListener("submit", (event: Event): void => {
      void (this as unknown as { saveSettingsForm?: (event: Event) => Promise<void> }).saveSettingsForm?.(event);
    });
    this.querySelector("[data-settings-scope]")?.addEventListener("change", (): void => {
      (this as unknown as { fillSettingsForm?: () => void }).fillSettingsForm?.();
    });
    this.querySelector("[data-ui-language]")?.addEventListener("change", (event: Event): void => {
      const locale: string | undefined = normalizeUiLocale((event.currentTarget as HTMLSelectElement).value);
      if (locale) setUiLocale(locale as Parameters<typeof setUiLocale>[0], this);
    });
    this.querySelector("[data-setting='defaultProvider']")?.addEventListener("change", (event: Event): void => {
      const methods = this as unknown as { syncCustomSettingInput?: (control: EventTarget | null) => void; fillModelControls?: () => void };
      methods.syncCustomSettingInput?.(event.currentTarget);
      methods.fillModelControls?.();
    });
    this.querySelector("[data-setting='defaultModel']")?.addEventListener("change", (event: Event): void => {
      (this as unknown as { syncCustomSettingInput?: (control: EventTarget | null) => void }).syncCustomSettingInput?.(event.currentTarget);
    });
    this.querySelector("[data-oauth-input]")?.addEventListener("keydown", (event: Event): void => {
      const keyboardEvent: KeyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === "Enter") {
        keyboardEvent.preventDefault();
        void (this as unknown as { sendOAuthInput?: () => Promise<void> }).sendOAuthInput?.();
      }
    });
  }

  handleAppClick(event: MouseEvent): void {
    const target: HTMLElement | null = event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
    if (!target) return;
    const methods = this as unknown as Record<string, (...args: unknown[]) => unknown>;
    const actions: Record<string, () => unknown> = {
      "open-settings": (): unknown => methods.openSettingsModal?.(),
      "close-settings": (): unknown => methods.closeSettingsModal?.(),
      "save-auth-provider": (): unknown => methods.saveAuthForm?.(event),
      "logout-auth-provider": (): unknown => methods.logoutAuthProvider?.(),
      "start-oauth-login": (): unknown => methods.startOAuthLogin?.(),
      "send-oauth-input": (): unknown => methods.sendOAuthInput?.(),
      "logout-oauth-provider": (): unknown => methods.logoutOAuthProvider?.(),
      "install-plugin": (): unknown => methods.installPluginFromForm?.(),
      "check-plugin-updates": (): unknown => methods.checkPluginUpdates?.(),
      "reload-plugins": (): unknown => methods.refreshPlugins?.(),
      "update-plugin": (): unknown => methods.updatePluginById?.(target.dataset.pluginId || ""),
      "toggle-plugin": (): unknown => methods.togglePlugin?.(target.dataset.pluginId || "", target.dataset.pluginEnabled === "true"),
      "uninstall-plugin": (): unknown => methods.uninstallPluginById?.(target.dataset.pluginId || ""),
    };
    const action = actions[target.dataset.action || ""];
    if (!action) return;
    event.preventDefault();
    void action();
  }

  setConnection(state: "ok" | "err" | "loading"): void { this.dataset.connection = state; }

  async openWorkspacePath(path: string): Promise<void> {
    const trimmedPath: string = path.trim();
    if (!trimmedPath) return;
    const workspace = (await openWorkspace(trimmedPath)) as WorkspaceSummary;
    const host: PiAppElement = this as unknown as PiAppElement;
    host.workspaceList = [workspace, ...host.workspaceList.filter((item: WorkspaceSummary): boolean => item.id !== workspace.id)];
    this.dataset.activeWorkspaceId = workspace.id;
    this.dispatchEvent(new CustomEvent("pi-workspace:opened", { detail: { workspace }, bubbles: true }));
  }

  async deleteWorkspace(workspaceId?: string): Promise<void> {
    if (!workspaceId) return;
    await deleteWorkspace(workspaceId);
    const host: PiAppElement = this as unknown as PiAppElement;
    host.workspaceList = host.workspaceList.filter((workspace: WorkspaceSummary): boolean => workspace.id !== workspaceId);
    this.dispatchEvent(new CustomEvent("pi-workspace:deleted", { detail: { workspaceId }, bubbles: true }));
  }

  async newSession(workspaceId?: string): Promise<void> { this.dispatchEvent(new CustomEvent("pi-session:new", { detail: { workspaceId }, bubbles: true })); }
  async deleteWorkspaceSessions(workspaceId?: string): Promise<void> { this.dispatchEvent(new CustomEvent("pi-session:clear-workspace", { detail: { workspaceId }, bubbles: true })); }
  async renameSession(sessionId?: string): Promise<void> { this.dispatchEvent(new CustomEvent("pi-session:rename", { detail: { sessionId }, bubbles: true })); }
  async deleteSession(sessionId?: string): Promise<void> { this.dispatchEvent(new CustomEvent("pi-session:delete", { detail: { sessionId }, bubbles: true })); }
  speechInputAllowed(): boolean { return false; }
  loadRuntimeStatus(): void {}
}

Object.assign(PiApp.prototype, pluginMethods, settingsMethods, oauthMethods);
customElements.define("pi-app", PiApp);
