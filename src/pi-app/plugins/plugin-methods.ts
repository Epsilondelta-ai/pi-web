import { getPlugins, installPlugin, setPluginEnabled, uninstallPlugin } from "../../shared/api/api";

type PluginManifest = {
  id: string;
  name?: string;
  version?: string;
  entry: string;
  enabled?: boolean;
};

type PluginToastInput = {
  type?: "success" | "choice" | "warning" | "error" | "connection";
  title: string;
  detail?: string;
  key?: string;
  html?: string;
};

type PluginModule = {
  default?: (context: PluginContext) => unknown;
  activate?: (context: PluginContext) => unknown;
};

type PluginContext = {
  app: HTMLElement;
  plugin: PluginManifest;
  toast: {
    show(input: PluginToastInput): unknown;
    dismissAll(): void;
  };
  api: {
    get(path: string): Promise<unknown>;
    post(path: string, body: unknown): Promise<unknown>;
  };
};

type PluginHost = HTMLElement & {
  loadedPlugins?: Set<string>;
  loadPlugins?: () => Promise<void>;
  showSystemToast?: (type: string, title: string, detail: string, key?: string) => unknown;
  dismissAllToasts?: () => void;
};

function pluginAssetUrl(plugin: PluginManifest): string {
  return `/api/plugins/${encodeURIComponent(plugin.id)}/assets/${plugin.entry}?v=${encodeURIComponent(plugin.version || "dev")}`;
}

function pluginLabel(plugin: PluginManifest): string {
  return plugin.name || plugin.id;
}

function request(path: string, method: string, body?: unknown): Promise<unknown> {
  return fetch(path, {
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
  list.replaceChildren(...plugins.map((plugin: PluginManifest) => {
    const row: HTMLDivElement = document.createElement("div");
    row.className = "plugin-row";
    row.innerHTML = `<span><strong></strong><small></small></span><span class="plugin-actions"><button type="button" data-action="toggle-plugin"></button><button type="button" data-action="uninstall-plugin"></button></span>`;
    row.dataset.pluginId = plugin.id;
    row.querySelector("strong")!.textContent = pluginLabel(plugin);
    row.querySelector("small")!.textContent = `${plugin.id} · ${plugin.version || "dev"}`;
    const buttons: NodeListOf<HTMLButtonElement> = row.querySelectorAll("button");
    buttons.forEach((button: HTMLButtonElement) => {
      button.dataset.pluginId = plugin.id;
    });
    buttons[0].dataset.pluginEnabled = String(plugin.enabled !== false);
    buttons[0].textContent = plugin.enabled === false ? "enable" : "disable";
    buttons[1].textContent = "remove";
    return row;
  }));
}

export const pluginMethods = {
  async loadPlugins(): Promise<void> {
    const host: PluginHost = this as PluginHost;
    const response = await getPlugins() as { plugins?: PluginManifest[] };
    const plugins: PluginManifest[] = response.plugins || [];
    renderPluginList(host, plugins);
    host.loadedPlugins ??= new Set<string>();
    for (const plugin of plugins) {
      if (plugin.enabled === false || host.loadedPlugins.has(plugin.id)) {
        continue;
      }
      try {
        const module: PluginModule = await import(/* @vite-ignore */ pluginAssetUrl(plugin));
        const activate = module.default || module.activate;
        if (activate) {
          await activate(this.pluginContext(plugin));
        }
        host.loadedPlugins.add(plugin.id);
      } catch (error) {
        host.showSystemToast?.("error", `Plugin failed: ${pluginLabel(plugin)}`, String(error), `plugin:${plugin.id}:error`);
      }
    }
  },

  pluginContext(plugin: PluginManifest): PluginContext {
    const host: PluginHost = this as PluginHost;
    return {
      app: host,
      plugin,
      toast: {
        show(input: PluginToastInput): unknown {
          const title = `[${pluginLabel(plugin)}] ${input.title}`;
          return host.showSystemToast?.(input.type || "warning", title, input.detail || input.html || "", input.key);
        },
        dismissAll(): void {
          host.dismissAllToasts?.();
        },
      },
      api: {
        get(path: string): Promise<unknown> {
          return request(path, "GET");
        },
        post(path: string, body: unknown): Promise<unknown> {
          return request(path, "POST", body);
        },
      },
    };
  },

  async refreshPlugins(): Promise<void> {
    const host: PluginHost = this as PluginHost;
    host.loadedPlugins = new Set<string>();
    await this.loadPlugins();
    host.showSystemToast?.("success", "Plugins reloaded", "Installed plugins were activated again.", "plugins:reloaded");
  },

  async installPluginFromForm(): Promise<void> {
    const host: PluginHost = this as PluginHost;
    const input: HTMLInputElement | null = host.querySelector("[data-plugin-path]");
    const path: string = input?.value.trim() || "";
    if (!path) {
      host.showSystemToast?.("warning", "Plugin path required", "Enter a local folder containing plugin.json.");
      return;
    }
    await installPlugin(path);
    if (input) {
      input.value = "";
    }
    host.loadedPlugins = new Set<string>();
    await this.loadPlugins();
    host.showSystemToast?.("success", "Plugin installed", path, `plugin-installed:${path}`);
  },

  async togglePlugin(pluginId: string, enabled: boolean): Promise<void> {
    const host: PluginHost = this as PluginHost;
    if (!pluginId) {
      return;
    }
    await setPluginEnabled(pluginId, !enabled);
    host.loadedPlugins = new Set<string>();
    await this.loadPlugins();
    host.showSystemToast?.("success", "Plugin updated", pluginId, `plugin-updated:${pluginId}:${!enabled}`);
  },

  async uninstallPluginById(pluginId: string): Promise<void> {
    const host: PluginHost = this as PluginHost;
    if (!pluginId) {
      return;
    }
    await uninstallPlugin(pluginId);
    host.loadedPlugins = new Set<string>();
    await this.loadPlugins();
    host.showSystemToast?.("success", "Plugin removed", pluginId, `plugin-removed:${pluginId}`);
  },
};
