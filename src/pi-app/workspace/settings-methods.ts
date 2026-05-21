import { getAuthProviders, getOAuthProviders, getWorkspaceSettings, logoutProvider, saveAPIKey, saveWorkspaceSettings } from "../../lib/api";
import { SETTINGS_FIELDS, parseSettingsPatch, parseWorkspaceSettings, settingsScopeSchema } from "./settings-schema";

function valueAt(settings, path) {
  return path.split(".").reduce((value, part) => value?.[part], settings);
}

function setPatchValue(patch, path, value) {
  const parts = path.split(".");
  let target = patch;
  for (const part of parts.slice(0, -1)) {
    target[part] ??= {};
    target = target[part];
  }
  target[parts.at(-1)] = value;
}

function settingLabel(path) {
  return path.replace(/([A-Z])/g, " $1").replace(/\./g, " · ").replace(/^./, (char) => char.toUpperCase());
}

function describeEffective(value) {
  if (value === undefined) return "not set";
  if (typeof value === "boolean") return value ? "on" : "off";
  return String(value);
}

export const settingsMethods = {
  async openSettingsModal() {
    const workspaceId = this.dataset.activeWorkspaceId;
    this.settingsModal?.removeAttribute("hidden");
    if (!workspaceId) {
      this.setSettingsStatus("open a workspace first", true);
      return;
    }
    if (!this.apiConnected) {
      this.setSettingsStatus("backend disconnected", true);
      return;
    }
    this.setSettingsStatus("loading settings…");
    try {
      const [{ settings }, auth, oauth] = await Promise.all([
        getWorkspaceSettings(workspaceId),
        getAuthProviders(),
        getOAuthProviders(),
      ]);
      this.settingsState = parseWorkspaceSettings(settings);
      this.authState = auth;
      this.oauthState = oauth;
      this.fillSettingsForm();
      this.fillAuthForm();
      this.fillOAuthForm();
      this.setSettingsStatus("blank fields inherit from effective settings");
    } catch (error) {
      this.setSettingsStatus(error instanceof Error ? error.message : String(error), true);
      this.setConnection("err");
    }
  },

  closeSettingsModal() {
    this.settingsModal?.setAttribute("hidden", "");
  },

  fillSettingsForm() {
    const form = this.querySelector("[data-settings-form]");
    if (!form || !this.settingsState) return;
    const scope = form.querySelector("[name='scope']")?.value || "project";
    const scopedSettings = this.settingsState[scope] || {};
    const effective = this.settingsState.effective || {};
    this.querySelector("[data-settings-path]").textContent = this.settingsState.paths?.[scope] || "—";
    for (const field of SETTINGS_FIELDS) {
      const control = form.querySelector(`[data-setting='${field.path}']`);
      if (!control) continue;
      const explicitValue = valueAt(scopedSettings, field.path);
      const effectiveValue = valueAt(effective, field.path);
      const hint = control.closest(".settings-field")?.querySelector("small");
      hint?.replaceChildren(`effective: ${describeEffective(effectiveValue)}`);
      this.fillSettingsControl(control, field, explicitValue, effectiveValue);
    }
  },

  fillSettingsControl(control, field, explicitValue, effectiveValue) {
    control.dataset.settingType = field.type;
    if (field.type === "text") {
      control.value = explicitValue === undefined ? "" : String(explicitValue);
      control.placeholder = describeEffective(effectiveValue);
      return;
    }
    if (field.type === "boolean") {
      control.value = explicitValue === undefined ? "inherit" : String(explicitValue);
      return;
    }
    control.value = explicitValue === undefined ? "inherit" : String(explicitValue);
  },

  fillAuthForm() {
    const providerSelect = this.querySelector("[data-auth-provider]");
    const status = this.querySelector("[data-auth-status]");
    if (!providerSelect || !this.authState?.providers) return;
    const previousValue = providerSelect.value;
    const providerOptions = this.authState.providers.map((provider) => {
      const option = document.createElement("option");
      option.value = provider.id;
      option.textContent = provider.configured ? `${provider.name} ✓` : provider.name;
      return option;
    });
    providerSelect.replaceChildren(...providerOptions);
    if (previousValue && this.authState.providers.some((provider) => provider.id === previousValue)) {
      providerSelect.value = previousValue;
    }
    this.setAuthStatus(status?.textContent || "API key is stored in ~/.pi/agent/auth.json");
  },

  async saveAuthForm(event) {
    event?.preventDefault();
    const form = this.querySelector("[data-auth-form]");
    if (!form || !this.apiConnected) return;
    const apiKeyControl = form.querySelector("[data-auth-api-key]");
    const provider = form.querySelector("[data-auth-provider]")?.value;
    const apiKey = apiKeyControl?.value?.trim();
    if (!provider || !apiKey) {
      this.setAuthStatus("provider and API key are required", true);
      return;
    }
    this.setAuthStatus("saving API key…");
    try {
      await saveAPIKey(provider, apiKey);
      apiKeyControl.value = "";
      this.authState = await getAuthProviders();
      this.fillAuthForm();
      this.setAuthStatus("API key saved");
      void this.loadRuntimeStatus?.(this.dataset.activeWorkspaceId);
    } catch (error) {
      this.setAuthStatus(error instanceof Error ? error.message : String(error), true);
      this.setConnection("err");
    }
  },

  async logoutAuthProvider() {
    const provider = this.querySelector("[data-auth-provider]")?.value;
    if (!provider || !this.apiConnected) return;
    this.setAuthStatus("removing credential…");
    try {
      await logoutProvider(provider);
      this.authState = await getAuthProviders();
      this.fillAuthForm();
      this.setAuthStatus("credential removed");
      void this.loadRuntimeStatus?.(this.dataset.activeWorkspaceId);
    } catch (error) {
      this.setAuthStatus(error instanceof Error ? error.message : String(error), true);
      this.setConnection("err");
    }
  },

  setAuthStatus(message, error = false) {
    const status = this.querySelector("[data-auth-status]");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("err", error);
  },

  async saveSettingsForm(event) {
    event?.preventDefault();
    const form = this.querySelector("[data-settings-form]");
    const workspaceId = this.dataset.activeWorkspaceId;
    if (!form || !workspaceId || !this.apiConnected) return;
    const scopeValue = form.querySelector("[name='scope']")?.value || "project";
    this.setSettingsStatus("saving…");
    try {
      const scope = settingsScopeSchema.parse(scopeValue);
      const patch = parseSettingsPatch(this.settingsPatchFromForm(form));
      const { settings } = await saveWorkspaceSettings(workspaceId, scope, patch);
      this.settingsState = parseWorkspaceSettings(settings);
      this.fillSettingsForm();
      this.setSettingsStatus("saved");
      void this.loadRuntimeStatus?.(workspaceId);
    } catch (error) {
      this.setSettingsStatus(error instanceof Error ? error.message : String(error), true);
      this.setConnection("err");
    }
  },

  settingsPatchFromForm(form) {
    const patch = {};
    for (const field of SETTINGS_FIELDS) {
      const control = form.querySelector(`[data-setting='${field.path}']`);
      if (!control) continue;
      setPatchValue(patch, field.path, this.settingValueFromControl(control, field));
    }
    return patch;
  },

  settingValueFromControl(control, field) {
    if (field.type === "text") {
      const value = control.value.trim();
      return value ? value : null;
    }
    if (control.value === "inherit") return null;
    if (field.type === "boolean") return control.value === "true";
    if (field.type === "numberSelect") return Number(control.value);
    return control.value;
  },

  setSettingsStatus(message, error = false) {
    const status = this.querySelector("[data-settings-status]");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("err", error);
  },

  settingsFieldLabel(path) {
    return settingLabel(path);
  },
};
