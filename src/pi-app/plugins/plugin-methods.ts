import {
  apiBase,
  getPlugins,
  installPlugin,
  reloadPlugins,
  setPluginEnabled,
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
