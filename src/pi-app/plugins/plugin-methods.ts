import {
  apiBase,
  cancelSession,
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
} from "../../shared/api/api";

type PluginManifest = {
  id: string;
  name?: string;
  version?: string;
  entry: string;
  enabled?: boolean;
  cacheKey?: string;
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
    chat(element: HTMLElement, options?: PluginMountOptions): PluginCleanup;
    composer(element: HTMLElement, options?: PluginMountOptions): PluginCleanup;
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

type PluginMountOptions = {
  replace?: boolean;
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
      row.innerHTML = `<span><strong></strong><small></small></span><span class="plugin-actions"><button type="button" data-action="toggle-plugin"></button><button type="button" data-action="uninstall-plugin"></button></span>`;
      row.dataset.pluginId = plugin.id;
      row.querySelector("strong")!.textContent = pluginLabel(plugin);
      row.querySelector("small")!.textContent =
        `${plugin.id} · ${plugin.version || "dev"}`;
      const buttons: NodeListOf<HTMLButtonElement> =
        row.querySelectorAll("button");
      buttons.forEach((button: HTMLButtonElement) => {
        button.dataset.pluginId = plugin.id;
      });
      buttons[0].dataset.pluginEnabled = String(plugin.enabled !== false);
      buttons[0].textContent = plugin.enabled === false ? "enable" : "disable";
      buttons[1].textContent = "remove";
      return row;
    }),
  );
}

function fallbackSelector(kind: "chat" | "composer"): string {
  return kind === "chat" ? "[data-chat-fallback]" : "[data-prompt-fallback]";
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
  options: PluginMountOptions = {},
): PluginCleanup {
  const existingRoot: HTMLElement | null = host.querySelector(rootSelector(kind));
  const fallback: HTMLElement | null = host.querySelector(fallbackSelector(kind));
  const appBody: HTMLElement | null = host.querySelector(".app-body");
  const root = existingRoot || element;
  if (!existingRoot) {
    element.dataset[rootAttribute(kind)] = "";
  }
  if (!existingRoot && !appBody) {
    throw new Error("missing .app-body plugin mount target");
  }
  const previousHidden = root.hidden;
  const fallbackWasHidden = fallback?.hidden === true;
  const restoreFallbackContent = options.replace ? adoptFallbackContent(kind, fallback, element) : undefined;
  root.hidden = false;
  if (options.replace && fallback) {
    fallback.hidden = true;
  }
  if (existingRoot) {
    existingRoot.append(element);
  } else {
    appBody?.append(element);
  }
  host.refreshChatSurfaceRefs?.();
  host.bindChatSurfaceEvents?.();
  host.initTranscriptWindow?.();
  host.updatePrompt?.();

  return () => {
    restoreFallbackContent?.();
    element.remove();
    root.hidden = previousHidden;
    if (fallback && options.replace) {
      fallback.hidden = fallbackWasHidden;
    }
    host.refreshChatSurfaceRefs?.();
    host.bindChatSurfaceEvents?.();
    host.initTranscriptWindow?.();
    host.updatePrompt?.();
  };
}

function adoptFallbackContent(
  kind: "chat" | "composer",
  fallback: HTMLElement | null,
  element: HTMLElement,
): PluginCleanup | undefined {
  if (kind === "chat") {
    return adoptFallbackChat(fallback, element);
  }

  adoptFallbackComposerState(fallback, element);
  return undefined;
}

function adoptFallbackChat(fallback: HTMLElement | null, element: HTMLElement): PluginCleanup | undefined {
  const fallbackTermInner: HTMLElement | null | undefined = fallback?.querySelector(".term-inner");
  const pluginTermInner: HTMLElement | null = element.querySelector(".term-inner");
  if (!fallbackTermInner || !pluginTermInner) {
    return undefined;
  }
  const placeholder = document.createComment("pi-web-chat-fallback-term-inner");
  fallbackTermInner.replaceWith(placeholder);
  pluginTermInner.replaceWith(fallbackTermInner);

  return () => {
    if (placeholder.parentNode) {
      placeholder.replaceWith(fallbackTermInner);
      return;
    }
    fallback?.append(fallbackTermInner);
  };
}

function adoptFallbackComposerState(fallback: HTMLElement | null, element: HTMLElement): void {
  const fallbackPrompt: HTMLTextAreaElement | null | undefined = fallback?.querySelector(".prompt-textarea");
  const pluginPrompt: HTMLTextAreaElement | null = element.querySelector(".prompt-textarea");
  if (fallbackPrompt && pluginPrompt) {
    pluginPrompt.value = fallbackPrompt.value;
  }
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
        chat(element: HTMLElement, options: PluginMountOptions = {}): PluginCleanup {
          return mountPluginSurface(host, "chat", element, options);
        },
        composer(element: HTMLElement, options: PluginMountOptions = {}): PluginCleanup {
          return mountPluginSurface(host, "composer", element, options);
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

  async refreshPlugins(): Promise<void> {
    await this.deactivateLoadedPlugins();
    await reloadPlugins();
    await this.loadPlugins();
    console.info("Plugins reloaded");
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
