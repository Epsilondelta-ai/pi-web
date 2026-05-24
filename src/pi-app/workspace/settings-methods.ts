import {
  getAuthProviders,
  getOAuthProviders,
  getWorkspaceModels,
  getWorkspaceSettings,
  logoutProvider,
  saveAPIKey,
  saveWorkspaceSettings,
} from "../../lib/api";
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

function customInputFor(control) {
  return control.closest(".settings-field")?.querySelector(`[data-custom-setting='${control.dataset.setting}']`);
}

function settingsValueChanged(scopedSettings, effective, path, value) {
  const explicitValue = valueAt(scopedSettings, path);
  if (explicitValue !== undefined) return explicitValue !== value;
  if (value === null) return false;
  const effectiveValue = valueAt(effective, path);
  return effectiveValue !== value;
}

export const settingsMethods = {
  async loadWorkspaceSettingsState(workspaceId = this.dataset.activeWorkspaceId) {
    if (!workspaceId || !this.apiConnected) return;
    const { settings } = await getWorkspaceSettings(workspaceId);
    this.settingsState = parseWorkspaceSettings(settings);
    this.syncSettingsStateToApp();
  },

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
    this.setModelControlsLoading("loading models…");
    const [settingsResult, authResult, oauthResult, modelsResult] = await Promise.allSettled([
      getWorkspaceSettings(workspaceId),
      getAuthProviders(),
      getOAuthProviders(),
      getWorkspaceModels(workspaceId),
    ]);
    if (settingsResult.status === "rejected") {
      this.setSettingsStatus(settingsResult.reason instanceof Error ? settingsResult.reason.message : String(settingsResult.reason), true);
      this.setConnection("err");
      return;
    }
    this.settingsState = parseWorkspaceSettings(settingsResult.value.settings);
    if (authResult.status === "fulfilled") {
      this.authState = authResult.value;
      this.fillAuthForm();
    }
    if (oauthResult.status === "fulfilled") {
      this.oauthState = oauthResult.value;
      this.fillOAuthForm();
    }
    if (modelsResult.status === "fulfilled") {
      this.modelState = modelsResult.value;
      this.fillModelControls();
    } else {
      this.modelState = null;
      this.fillFallbackModelControls();
    }
    this.fillSettingsForm();
    this.syncSettingsStateToApp();
    const errors = [authResult, oauthResult, modelsResult]
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
    if (modelsResult.status === "fulfilled" && modelsResult.value?.error) errors.push(modelsResult.value.error);
    this.setSettingsStatus(errors[0] || "blank fields inherit from effective settings", errors.length > 0);
    if (errors.length > 0) this.setConnection("err");
  },

  closeSettingsModal() {
    this.settingsModal?.setAttribute("hidden", "");
  },

  setModelControlsLoading(message = "loading models…") {
    for (const control of this.querySelectorAll("[data-setting='defaultProvider'], [data-setting='defaultModel']")) {
      const option = document.createElement("option");
      option.value = "inherit";
      option.textContent = message;
      control.replaceChildren(option);
      control.value = "inherit";
      control.disabled = true;
      const customInput = customInputFor(control);
      if (customInput) {
        customInput.value = "";
        customInput.hidden = true;
      }
    }
  },

  fillModelControls() {
    const providerControl = this.querySelector("[data-setting='defaultProvider']");
    const modelControl = this.querySelector("[data-setting='defaultModel']");
    if (!providerControl || !modelControl || !this.modelState?.providers) return;
    const providers = this.modelState.providers;
    this.replaceSelectOptions(providerControl, providers.map((provider) => provider.id));
    const selectedProvider = providerControl.value && providerControl.value !== "inherit" && providerControl.value !== "custom"
      ? providerControl.value
      : providers[0]?.id;
    const providerModels = providers.find((provider) => provider.id === selectedProvider)?.models;
    const models = providerModels || providers.flatMap((provider) => provider.models || []);
    this.replaceSelectOptions(modelControl, models.map((model) => model.id));
  },

  fillFallbackModelControls() {
    const effective = this.settingsState?.effective || {};
    const provider = typeof effective.defaultProvider === "string" ? effective.defaultProvider : undefined;
    const model = typeof effective.defaultModel === "string" ? effective.defaultModel : undefined;
    const providerControl = this.querySelector("[data-setting='defaultProvider']");
    const modelControl = this.querySelector("[data-setting='defaultModel']");
    if (providerControl) this.replaceSelectOptions(providerControl, provider ? [provider] : []);
    if (modelControl) this.replaceSelectOptions(modelControl, model ? [model] : []);
  },

  replaceSelectOptions(control, values) {
    const previousValue = control.value;
    const options = ["inherit", ...values, "custom"];
    control.replaceChildren(...options.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value === "custom" ? "custom…" : value;
      return option;
    }));
    control.disabled = false;
    control.value = options.includes(previousValue) ? previousValue : "inherit";
    this.syncCustomSettingInput(control);
  },

  syncCustomSettingInput(control) {
    const customInput = customInputFor(control);
    if (!customInput) return;
    const custom = control.value === "custom";
    customInput.hidden = !custom;
    if (custom) customInput.focus?.();
  },

  fillSettingsForm() {
    const form = this.querySelector("[data-settings-form]");
    if (!form || !this.settingsState) return;
    this.syncSecureContextSettingsControls();
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
      if (field.path === "defaultProvider") this.fillModelControls();
    }
    this.fillSpeechInputAdvancedControls(scopedSettings, effective);
  },

  fillSpeechInputAdvancedControls(scopedSettings, effective) {
    const fields = [
      { path: "speechInput.useLocalWhisper", type: "checkbox" },
      { path: "speechInput.whisperModel", type: "whisperModel" },
    ];
    for (const field of fields) {
      const control = this.querySelector(`[data-setting='${field.path}']`);
      if (!control) continue;
      const explicitValue = valueAt(scopedSettings, field.path);
      const effectiveValue = valueAt(effective, field.path) || (field.path === "speechInput.whisperModel" ? "tiny-q5" : undefined);
      const hint = control.closest(".settings-field")?.querySelector("small");
      hint?.replaceChildren(`effective: ${describeEffective(effectiveValue)}`);
      this.fillSettingsControl(control, field, explicitValue, effectiveValue);
    }
    void this.updateWhisperCacheStatus?.();
  },

  fillSettingsControl(control, field, explicitValue, effectiveValue) {
    control.dataset.settingType = field.type;
    if (field.type === "providerSelect" || field.type === "modelSelect") {
      const value = explicitValue === undefined ? "inherit" : String(explicitValue);
      const customInput = customInputFor(control);
      if ([...control.options].some((option) => option.value === value)) {
        control.value = value;
        if (customInput) customInput.value = "";
      } else {
        control.value = "custom";
        if (customInput) customInput.value = value;
      }
      this.syncCustomSettingInput(control);
      return;
    }
    if (field.type === "text" || field.type === "numberText") {
      control.value = explicitValue === undefined ? "" : String(explicitValue);
      control.placeholder = describeEffective(effectiveValue);
      return;
    }
    if (field.type === "boolean") {
      control.value = explicitValue === undefined ? "inherit" : String(explicitValue);
      return;
    }
    if (field.type === "checkbox") {
      control.checked = explicitValue === undefined ? effectiveValue === true : explicitValue === true;
      return;
    }
    if (field.type === "voiceEngine") {
      control.value = explicitValue === undefined ? String(effectiveValue || "browser") : String(explicitValue || "browser");
      return;
    }
    if (field.type === "speechLanguage") {
      control.value = explicitValue === undefined ? String(effectiveValue || "system") : String(explicitValue || "system");
      return;
    }
    if (field.type === "whisperModel") {
      control.value = explicitValue === undefined ? String(effectiveValue || "tiny-q5") : String(explicitValue || "tiny-q5");
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
    if (this.refreshWhisperModelRequirement?.() === false) {
      this.setSettingsStatus("download selected Whisper model before saving", true);
      return;
    }
    this.setSettingsStatus("saving…");
    try {
      const scope = settingsScopeSchema.parse(scopeValue);
      const patch = parseSettingsPatch(this.settingsPatchFromForm(form));
      const { settings } = await saveWorkspaceSettings(workspaceId, scope, patch);
      this.settingsState = parseWorkspaceSettings(settings);
      this.fillSettingsForm();
      this.syncSettingsStateToApp();
      this.setSettingsStatus("saved");
      void this.loadRuntimeStatus?.(workspaceId);
    } catch (error) {
      this.setSettingsStatus(error instanceof Error ? error.message : String(error), true);
      this.setConnection("err");
    }
  },

  syncSettingsStateToApp() {
    const allowSpeechInput = this.speechInputAllowed?.() === true;
    const speechInput = this.settingsState?.effective?.speechInput || {};
    const voice = this.settingsState?.effective?.voice || {};
    this.readResponsesAloud = this.settingsState?.effective?.readResponsesAloud === true;
    this.voiceEngine = "browser";
    this.enableSpeechInput = allowSpeechInput && this.settingsState?.effective?.enableSpeechInput === true;
    this.useLocalWhisper = allowSpeechInput && speechInput.useLocalWhisper === true;
    this.whisperModel = speechInput.whisperModel || "tiny-q5";
    if (!this.enableSpeechInput) this.stopSpeechInput?.();
    this.voiceLanguage = voice.language || this.settingsState?.effective?.speechLanguage || "system";
    this.speechLanguage = speechInput.language || this.settingsState?.effective?.speechLanguage || "system";
    this.syncReadAloudControls?.();
    this.syncSecureContextSettingsControls();
    this.syncSpeechInputControls?.();
  },

  syncReadAloudFromSettingsState() {
    this.syncSettingsStateToApp();
  },

  syncSecureContextSettingsControls() {
    const allowSpeechInput = this.speechInputAllowed?.() === true;
    for (const field of this.querySelectorAll("[data-secure-context-only='https']")) {
      field.hidden = !allowSpeechInput;
    }
  },

  settingsPatchFromForm(form) {
    const patch = {};
    const scope = form.querySelector("[name='scope']")?.value || "project";
    const scopedSettings = this.settingsState?.[scope] || {};
    const effective = this.settingsState?.effective || {};
    const allowSpeechInput = this.speechInputAllowed?.() === true;
    const addChangedValue = (path, value) => {
      if (settingsValueChanged(scopedSettings, effective, path, value)) setPatchValue(patch, path, value);
    };
    for (const field of SETTINGS_FIELDS) {
      if ((field.path === "enableSpeechInput" || field.path.startsWith("speechInput.")) && !allowSpeechInput) continue;
      const control = form.querySelector(`[data-setting='${field.path}']`);
      if (!control) continue;
      addChangedValue(field.path, this.settingValueFromControl(control, field));
    }
    for (const control of form.querySelectorAll("[data-setting^='speechInput.']")) {
      if (!allowSpeechInput) continue;
      const type = control.type === "checkbox" ? "checkbox" : "select";
      addChangedValue(control.dataset.setting, this.settingValueFromControl(control, { type }));
    }
    return patch;
  },

  settingValueFromControl(control, field) {
    if (field.type === "text") {
      const value = control.value.trim();
      return value ? value : null;
    }
    if (field.type === "numberText") {
      const value = control.value.trim();
      return value ? Number(value) : null;
    }
    if (field.type === "providerSelect" || field.type === "modelSelect") {
      if (control.value === "inherit") return null;
      if (control.value === "custom") {
        const value = customInputFor(control)?.value?.trim();
        return value ? value : null;
      }
      return control.value;
    }
    if (field.type === "checkbox") return control.checked === true;
    if (field.type === "speechLanguage") return control.value === "system" ? null : control.value;
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
