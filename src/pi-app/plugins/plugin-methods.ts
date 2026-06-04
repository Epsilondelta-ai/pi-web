import {
  apiBase,
  cancelSession,
  getPluginUpdates,
  getPlugins,
  getSession,
  getWorkspaceFile,
  installPlugin,
  postPrompt,
  reloadPlugins,
  runShellCommand,
  searchWorkspaceFiles,
  sessionEvents,
  setPluginEnabled,
  steerSession,
  uninstallPlugin,
  updatePlugin,
} from "../../shared/api/api";

type PluginManifest = {
  id: string;
  name?: string;
  version?: string;
  entry: string;
  enabled?: boolean;
  cacheKey?: string;
};

type PluginUpdateStatus = {
  id: string;
  currentVersion?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  checked?: boolean;
  error?: string;
};

type PluginCleanup = () => unknown | Promise<unknown>;

type PluginCleanupObject = {
  deactivate?: PluginCleanup;
  dispose?: PluginCleanup;
};

type PluginActivationResult = PluginCleanup | PluginCleanupObject | void;

type PluginModule = {
  default?: (
    context: PluginContext,
  ) => PluginActivationResult | Promise<PluginActivationResult>;
  activate?: (
    context: PluginContext,
  ) => PluginActivationResult | Promise<PluginActivationResult>;
  deactivate?: (context: PluginContext) => unknown | Promise<unknown>;
};

type PluginContext = {
  app: HTMLElement;
  plugin: PluginManifest;
  api: {
    get(path: string): Promise<unknown>;
    post(path: string, body: unknown): Promise<unknown>;
  };
  backend(method: string, body: unknown): Promise<unknown>;
  mount: {
    chat(element: HTMLElement): PluginCleanup;
    composer(element: HTMLElement): PluginCleanup;
  };
  chat: {
    appendMessage(message: unknown): void;
    appendDelta(delta: unknown): void;
    renderMessages(messages: unknown[]): void;
    finalizeStreamingMessages(): void;
    scrollToBottom(): void;
  };
  composer: {
    getPrompt(): string;
    setPrompt(value: string): void;
    submitPrompt(): Promise<void>;
    cancelActiveSession(): Promise<void>;
    addAttachment(file: File): Promise<void>;
    clearAttachments(): void;
  };
  session: {
    activeId(): string;
    activeWorkspaceId(): string;
    running(): boolean;
    get(sessionId: string, options?: { limit?: number; before?: string }): Promise<unknown>;
    postPrompt(sessionId: string, text: string, attachments?: unknown[]): Promise<unknown>;
    steer(sessionId: string, text: string, attachments?: unknown[]): Promise<unknown>;
    cancel(sessionId: string): Promise<unknown>;
    events(sessionId: string, options?: unknown): unknown;
  };
  files: {
    search(workspaceId: string, query: string): Promise<unknown>;
    read(workspaceId: string, path: string): Promise<unknown>;
  };
  shell: {
    run(workspaceId: string, command: string): Promise<unknown>;
  };
};

type ActivePlugin = {
  context: PluginContext;
  module: PluginModule;
  cleanup?: PluginActivationResult;
};

type PluginHost = HTMLElement & {
  activePlugins?: Map<string, ActivePlugin>;
  loadedPlugins?: Set<string>;
  loadPlugins?: () => Promise<void>;
  importPluginModule?: (url: string) => Promise<PluginModule>;
  refreshChatSurfaceRefs?: () => void;
  bindChatSurfaceEvents?: () => void;
  initTranscriptWindow?: () => void;
  updatePrompt?: () => void;
  appendMessage?: (message: unknown) => void;
  appendDelta?: (delta: unknown) => void;
  renderMessages?: (messages: unknown[]) => void;
  finalizeStreamingMessages?: () => void;
  scrollTerm?: () => void;
  submitPrompt?: () => Promise<void>;
  cancelActiveSession?: () => Promise<void>;
  addFiles?: (files: FileList | File[]) => Promise<void>;
  prompt?: HTMLTextAreaElement | null;
  attachmentContents?: unknown[];
  attachments?: HTMLElement | null;
  requiredChatFallbackCleanup?: PluginCleanup;
};

function pluginAssetUrl(plugin: PluginManifest): string {
  const version = plugin.cacheKey || plugin.version || "dev";
  return `${apiBase()}/api/plugins/${encodeURIComponent(plugin.id)}/assets/${plugin.entry}?v=${encodeURIComponent(version)}`;
}

function pluginLabel(plugin: PluginManifest): string {
  return plugin.name || plugin.id;
}

function importPluginModule(url: string): Promise<PluginModule> {
  return import(/* @vite-ignore */ url) as Promise<PluginModule>;
}

function request(
  path: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  return fetch(`${apiBase()}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (response: Response) => {
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  });
}

function renderPluginList(host: PluginHost, plugins: PluginManifest[]): void {
  const list: HTMLElement | null = host.querySelector("[data-plugin-list]");
  if (!list) {
    return;
  }

  if (plugins.length === 0) {
    list.textContent = "No plugins installed.";
    return;
  }

  list.replaceChildren(
    ...plugins.map((plugin: PluginManifest) => {
      const row: HTMLDivElement = document.createElement("div");
      row.className = "plugin-row";
      row.innerHTML = [
        `<span><strong></strong><small data-plugin-version></small></span>`,
        `<span class="plugin-actions">`,
        `<button type="button" data-action="update-plugin" hidden>update</button>`,
        `<button type="button" data-action="toggle-plugin"></button>`,
        `<button type="button" data-action="uninstall-plugin"></button>`,
        `</span>`,
      ].join("");
      row.dataset.pluginId = plugin.id;
      row.querySelector("strong")!.textContent = pluginLabel(plugin);
      row.querySelector("[data-plugin-version]")!.textContent =
        `${plugin.id} · ${plugin.version || "dev"}`;
      const buttons: NodeListOf<HTMLButtonElement> = row.querySelectorAll("button");
      buttons.forEach((button: HTMLButtonElement) => {
        button.dataset.pluginId = plugin.id;
      });
      buttons[1].dataset.pluginEnabled = String(plugin.enabled !== false);
      buttons[1].textContent = plugin.enabled === false ? "enable" : "disable";
      buttons[2].textContent = "remove";
      return row;
    }),
  );
}

function setPluginUpdateChecking(host: PluginHost): void {
  host.querySelectorAll<HTMLElement>("[data-plugin-version]").forEach((version: HTMLElement) => {
    version.dataset.baseText = version.dataset.baseText || version.textContent || "";
    version.textContent = `${version.dataset.baseText} · checking updates…`;
  });
}

function clearPluginUpdateChecking(host: PluginHost, message: string): void {
  host.querySelectorAll<HTMLElement>("[data-plugin-version]").forEach((version: HTMLElement) => {
    const baseText: string = version.dataset.baseText || version.textContent || "";
    version.textContent = message ? `${baseText} · ${message}` : baseText;
  });
}

function renderPluginUpdateStatus(host: PluginHost, status: PluginUpdateStatus): void {
  const row: HTMLElement | null = host.querySelector(
    `[data-plugin-id='${CSS.escape(status.id)}']`,
  );
  if (!row) {
    return;
  }
  const version: HTMLElement | null = row.querySelector("[data-plugin-version]");
  const updateButton: HTMLButtonElement | null = row.querySelector("[data-action='update-plugin']");
  const baseText: string = version?.dataset.baseText || version?.textContent || "";
  if (version) {
    version.dataset.baseText = baseText;
    if (status.updateAvailable && status.latestVersion) {
      version.textContent =
        `${status.id} · ${status.currentVersion || "dev"} → ${status.latestVersion} · update available`;
    } else if (status.error) {
      version.textContent = `${baseText} · update check failed`;
      version.title = status.error;
    } else {
      version.textContent = baseText;
      version.removeAttribute("title");
    }
  }
  if (updateButton) {
    updateButton.hidden = !status.updateAvailable;
  }
}

function createRequiredChatFallback(host: PluginHost): PluginCleanup | undefined {
  const appBody: HTMLElement | null = host.querySelector(".app-body");
  if (!appBody) {
    return undefined;
  }
  const chat = document.createElement("main");
  chat.className = "main pi-web-chat-required-fallback";
  chat.dataset.main = "session";
  chat.dataset.pluginChatRoot = "";
  chat.innerHTML = [
    `<div class="term"><div class="term-inner">`,
    `<div class="msg" data-kind="banner"><div class="prefix pi">pi &gt;</div>`,
    `<div class="body">pi-web-chat plugin is required for chat input. Install or enable pi-web-chat.</div></div>`,
    `</div></div>`,
  ].join("");
  const composer = document.createElement("section");
  composer.className = "prompt-region pi-web-chat-required-fallback";
  composer.dataset.pluginComposerRoot = "";
  composer.innerHTML = [
    `<div class="prompt-bar"><div class="prompt-input-col">`,
    `<textarea class="prompt-textarea" rows="1" disabled`,
    ` placeholder="pi-web-chat plugin required"></textarea></div>`,
    `<div class="prompt-actions"><button class="send-btn is-disabled" type="button"`,
    ` aria-label="send" title="send" aria-disabled="true" disabled>send</button></div></div>`,
    `<div class="prompt-meta" data-prompt-meta>chat plugin missing</div>`,
  ].join("");
  appBody.append(chat, composer);
  host.refreshChatSurfaceRefs?.();
  host.initTranscriptWindow?.();

  return () => {
    chat.remove();
    composer.remove();
  };
}

function ensureRequiredChatSurface(host: PluginHost): void {
  if (host.querySelector(".term-inner") && host.querySelector(".prompt-textarea")) {
    return;
  }
  host.requiredChatFallbackCleanup = createRequiredChatFallback(host);
}

function rootAttribute(kind: "chat" | "composer"): "pluginChatRoot" | "pluginComposerRoot" {
  return kind === "chat" ? "pluginChatRoot" : "pluginComposerRoot";
}

function rootSelector(kind: "chat" | "composer"): string {
  return kind === "chat" ? "[data-plugin-chat-root]" : "[data-plugin-composer-root]";
}

function mountPluginSurface(
  host: PluginHost,
  kind: "chat" | "composer",
  element: HTMLElement,
): PluginCleanup {
  const existingRoot: HTMLElement | null = host.querySelector(rootSelector(kind));
  const appBody: HTMLElement | null = host.querySelector(".app-body");
  const root = existingRoot || element;
  if (!existingRoot) {
    element.dataset[rootAttribute(kind)] = "";
  }
  if (!existingRoot && !appBody) {
    throw new Error("missing .app-body plugin mount target");
  }
  const previousHidden = root.hidden;
  root.hidden = false;
  if (existingRoot) {
    existingRoot.append(element);
  } else {
    appBody.append(element);
  }
  host.refreshChatSurfaceRefs?.();
  host.bindChatSurfaceEvents?.();
  host.initTranscriptWindow?.();
  host.updatePrompt?.();

  return () => {
    element.remove();
    root.hidden = previousHidden;
    host.refreshChatSurfaceRefs?.();
    host.bindChatSurfaceEvents?.();
    host.initTranscriptWindow?.();
    host.updatePrompt?.();
  };
}

async function runPluginCleanup(active: ActivePlugin): Promise<void> {
  if (typeof active.cleanup === "function") {
    await active.cleanup();
    return;
  }

  if (typeof active.cleanup === "object" && active.cleanup?.deactivate) {
    await active.cleanup.deactivate();
    return;
  }

  if (typeof active.cleanup === "object" && active.cleanup?.dispose) {
    await active.cleanup.dispose();
    return;
  }

  if (active.module.deactivate) {
    await active.module.deactivate(active.context);
  }
}

export const pluginMethods = {
  async loadPlugins(): Promise<void> {
    const host: PluginHost = this as PluginHost;
    host.requiredChatFallbackCleanup?.();
    host.requiredChatFallbackCleanup = undefined;
    const response = (await getPlugins()) as { plugins?: PluginManifest[] };
    const plugins: PluginManifest[] = response.plugins || [];
    renderPluginList(host, plugins);
    host.activePlugins ??= new Map<string, ActivePlugin>();
    host.loadedPlugins ??= new Set<string>();
    for (const plugin of plugins) {
      if (plugin.enabled === false || host.activePlugins.has(plugin.id)) {
        continue;
      }
      try {
        const module: PluginModule = await (
          host.importPluginModule || importPluginModule
        )(pluginAssetUrl(plugin));
        const activate = module.default || module.activate;
        const context = this.pluginContext(plugin);
        const cleanup: PluginActivationResult = activate
          ? await activate(context)
          : undefined;
        host.activePlugins.set(plugin.id, { context, module, cleanup });
        host.loadedPlugins.add(plugin.id);
      } catch (error) {
        console.error(`Plugin failed: ${pluginLabel(plugin)}`, error);
      }
    }
    ensureRequiredChatSurface(host);
  },

  async deactivateLoadedPlugin(pluginId: string): Promise<void> {
    const host: PluginHost = this as PluginHost;
    const active = host.activePlugins?.get(pluginId);
    if (!active) {
      host.loadedPlugins?.delete(pluginId);
      return;
    }

    try {
      await runPluginCleanup(active);
    } catch (error) {
      console.error(
        `Plugin cleanup failed: ${pluginLabel(active.context.plugin)}`,
        error,
      );
    }
    host.activePlugins?.delete(pluginId);
    host.loadedPlugins?.delete(pluginId);
  },

  async deactivateLoadedPlugins(): Promise<void> {
    const host: PluginHost = this as PluginHost;
    const pluginIds: string[] = [...(host.activePlugins?.keys() || [])];
    for (const pluginId of pluginIds) {
      await this.deactivateLoadedPlugin(pluginId);
    }
    host.activePlugins = new Map<string, ActivePlugin>();
    host.loadedPlugins = new Set<string>();
  },

  pluginContext(plugin: PluginManifest): PluginContext {
    const host: PluginHost = this as PluginHost;
    return {
      app: host,
      plugin,
      api: {
        get(path: string): Promise<unknown> {
          return request(path, "GET");
        },
        post(path: string, body: unknown): Promise<unknown> {
          return request(path, "POST", body);
        },
      },
      backend(method: string, body: unknown): Promise<unknown> {
        const path = `/api/plugins/${encodeURIComponent(plugin.id)}/backend/${encodeURIComponent(method)}`;
        return request(path, "POST", body);
      },
      mount: {
        chat(element: HTMLElement): PluginCleanup {
          return mountPluginSurface(host, "chat", element);
        },
        composer(element: HTMLElement): PluginCleanup {
          return mountPluginSurface(host, "composer", element);
        },
      },
      chat: {
        appendMessage(message: unknown): void {
          host.appendMessage?.(message);
        },
        appendDelta(delta: unknown): void {
          host.appendDelta?.(delta);
        },
        renderMessages(messages: unknown[]): void {
          host.renderMessages?.(messages);
        },
        finalizeStreamingMessages(): void {
          host.finalizeStreamingMessages?.();
        },
        scrollToBottom(): void {
          host.scrollTerm?.();
        },
      },
      composer: {
        getPrompt(): string {
          return host.prompt?.value || "";
        },
        setPrompt(value: string): void {
          if (host.prompt) {
            host.prompt.value = value;
          }
          host.updatePrompt?.();
        },
        submitPrompt(): Promise<void> {
          return host.submitPrompt?.() || Promise.resolve();
        },
        cancelActiveSession(): Promise<void> {
          return host.cancelActiveSession?.() || Promise.resolve();
        },
        addAttachment(file: File): Promise<void> {
          return host.addFiles?.([file]) || Promise.resolve();
        },
        clearAttachments(): void {
          host.attachmentContents = [];
          host.attachments?.replaceChildren();
          if (host.attachments) {
            host.attachments.hidden = true;
          }
          host.updatePrompt?.();
        },
      },
      session: {
        activeId(): string {
          return host.dataset.activeSessionId || "";
        },
        activeWorkspaceId(): string {
          return host.dataset.activeWorkspaceId || "";
        },
        running(): boolean {
          return host.classList.contains("running") || host.dataset.mode === "running";
        },
        get(sessionId: string, options?: { limit?: number; before?: string }): Promise<unknown> {
          return getSession(sessionId, options || {});
        },
        postPrompt(sessionId: string, text: string, attachments: unknown[] = []): Promise<unknown> {
          return postPrompt(sessionId, text, attachments);
        },
        steer(sessionId: string, text: string, attachments: unknown[] = []): Promise<unknown> {
          return steerSession(sessionId, text, attachments);
        },
        cancel(sessionId: string): Promise<unknown> {
          return cancelSession(sessionId);
        },
        events(sessionId: string, options?: unknown): unknown {
          return sessionEvents(sessionId, options as Parameters<typeof sessionEvents>[1]);
        },
      },
      files: {
        search(workspaceId: string, query: string): Promise<unknown> {
          return searchWorkspaceFiles(workspaceId, query);
        },
        read(workspaceId: string, path: string): Promise<unknown> {
          return getWorkspaceFile(workspaceId, path);
        },
      },
      shell: {
        run(workspaceId: string, command: string): Promise<unknown> {
          return runShellCommand(workspaceId, command);
        },
      },
    };
  },

  async checkPluginUpdates(): Promise<void> {
    const host: PluginHost = this as PluginHost;
    setPluginUpdateChecking(host);
    try {
      const response = (await getPluginUpdates()) as { plugins?: PluginUpdateStatus[] };
      for (const status of response.plugins || []) {
        renderPluginUpdateStatus(host, status);
      }
    } catch (error) {
      clearPluginUpdateChecking(host, "update check failed");
      console.warn("Plugin update check failed", error);
    }
  },

  async refreshPlugins(): Promise<void> {
    await this.deactivateLoadedPlugins();
    await reloadPlugins();
    await this.loadPlugins();
    console.info("Plugins reloaded");
  },

  async updatePluginById(pluginId: string): Promise<void> {
    if (!pluginId) {
      return;
    }

    await this.deactivateLoadedPlugin(pluginId);
    await updatePlugin(pluginId);
    await this.loadPlugins();
    console.info(`Plugin updated: ${pluginId}`);
  },

  async installPluginFromForm(): Promise<void> {
    const host: PluginHost = this as PluginHost;
    const sourceSelect: HTMLSelectElement | null = host.querySelector(
      "[data-plugin-source]",
    );
    const input: HTMLInputElement | null =
      host.querySelector("[data-plugin-path]");
    const source: string =
      sourceSelect?.value === "github" ? "github" : "local";
    const value: string = input?.value.trim() || "";
    if (!value) {
      const detail =
        source === "github"
          ? "Enter a GitHub URL or owner/repo."
          : "Enter a local folder containing plugin.json.";
      console.warn(detail);
      return;
    }
    await installPlugin(source, value);
    input!.value = "";
    await this.deactivateLoadedPlugins();
    await this.loadPlugins();
    console.info(`Plugin installed: ${source}:${value}`);
  },

  async togglePlugin(pluginId: string, enabled: boolean): Promise<void> {
    if (!pluginId) {
      return;
    }

    if (enabled) {
      await this.deactivateLoadedPlugin(pluginId);
    }
    await setPluginEnabled(pluginId, !enabled);
    await this.loadPlugins();
    console.info(`Plugin updated: ${pluginId}:${!enabled}`);
  },

  async uninstallPluginById(pluginId: string): Promise<void> {
    if (!pluginId) {
      return;
    }

    await this.deactivateLoadedPlugin(pluginId);
    await uninstallPlugin(pluginId);
    await this.loadPlugins();
    console.info(`Plugin removed: ${pluginId}`);
  },
};
