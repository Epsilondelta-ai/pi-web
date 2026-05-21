import { getWorkspaceSettings, saveWorkspaceSettings } from "../lib/api";

const SETTINGS_FIELDS = [
  { path: "defaultProvider", type: "text" },
  { path: "defaultModel", type: "text" },
  { path: "defaultThinkingLevel", type: "select" },
  { path: "theme", type: "text" },
  { path: "compaction.enabled", type: "boolean" },
  { path: "terminal.showImages", type: "boolean" },
  { path: "terminal.imageWidthCells", type: "numberSelect" },
  { path: "images.autoResize", type: "boolean" },
  { path: "images.blockImages", type: "boolean" },
  { path: "enableSkillCommands", type: "boolean" },
  { path: "showHardwareCursor", type: "boolean" },
  { path: "editorPaddingX", type: "numberSelect" },
  { path: "autocompleteMaxVisible", type: "numberSelect" },
  { path: "terminal.clearOnShrink", type: "boolean" },
  { path: "terminal.showTerminalProgress", type: "boolean" },
  { path: "steeringMode", type: "select" },
  { path: "followUpMode", type: "select" },
  { path: "transport", type: "select" },
  { path: "hideThinkingBlock", type: "boolean" },
  { path: "collapseChangelog", type: "boolean" },
  { path: "quietStartup", type: "boolean" },
  { path: "enableInstallTelemetry", type: "boolean" },
  { path: "doubleEscapeAction", type: "select" },
  { path: "treeFilterMode", type: "select" },
  { path: "warnings.anthropicExtraUsage", type: "boolean" },
];

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
      const { settings } = await getWorkspaceSettings(workspaceId);
      this.settingsState = settings;
      this.fillSettingsForm();
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

  async saveSettingsForm(event) {
    event?.preventDefault();
    const form = this.querySelector("[data-settings-form]");
    const workspaceId = this.dataset.activeWorkspaceId;
    if (!form || !workspaceId || !this.apiConnected) return;
    const scope = form.querySelector("[name='scope']")?.value || "project";
    const patch = this.settingsPatchFromForm(form);
    this.setSettingsStatus("saving…");
    try {
      const { settings } = await saveWorkspaceSettings(workspaceId, scope, patch);
      this.settingsState = settings;
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
