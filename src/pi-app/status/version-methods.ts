import {
  getPiPackageUpdateStatus,
  getPiUpdateStatus,
  getPiVersionStatus,
  getVersionStatus,
  startPiUpdate,
} from "../../shared/api/api";

const IGNORED_PI_UPDATE_KEY = "piweb:ignored-pi-update";
const IGNORED_PI_PACKAGE_UPDATE_KEY = "piweb:ignored-pi-package-update";

function ignoredPackageUpdates(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [String(raw)];
  }
}

export const versionMethods = {
  async loadVersionStatus() {
    try {
      const [webStatus, piStatus, packageStatus, updateStatus] = await Promise.allSettled([
        getVersionStatus(),
        getPiVersionStatus(),
        getPiPackageUpdateStatus(),
        getPiUpdateStatus(),
      ]);
      if (webStatus.status === "fulfilled") this.renderVersionStatus(webStatus.value);
      if (updateStatus.status === "fulfilled") this.renderPiUpdateStatus(updateStatus.value);
      if (piStatus.status === "fulfilled") this.renderPiVersionStatus(piStatus.value);
      if (packageStatus.status === "fulfilled") this.renderPiPackageUpdateStatus(packageStatus.value);
    } catch {}
  },

  async loadWorkspacePackageStatus(workspaceId: string) {
    try {
      const packageStatus = await getPiPackageUpdateStatus(workspaceId);
      packageStatus.workspaceId = workspaceId;
      this.renderPiPackageUpdateStatus(packageStatus);
    } catch {}
  },

  renderVersionStatus(status) {
    const button = this.querySelector("[data-action='show-update-tip']");
    if (!button) return;
    const updateAvailable = status?.updateAvailable && status?.latestVersion !== status?.currentVersion;
    button.hidden = !updateAvailable;
    if (updateAvailable) {
      button.title = `Current ${status.currentVersion}; latest ${status.latestVersion}`;
      this.notifyUpdateAvailable?.(status);
    }
  },

  renderPiVersionStatus(status) {
    if (!status?.updateAvailable || status?.latestVersion === status?.currentVersion) return;
    this.notifyPiUpdateAvailable?.(status);
  },

  renderPiPackageUpdateStatus(status) {
    const updates = Array.isArray(status?.updates) ? status.updates : [];
    if (!updates.length) return;
    if (status?.scope === "workspace") {
      this.notifyWorkspacePackageUpdateAvailable?.(updates, status.workspaceId);
    } else {
      this.notifyPiPackageUpdateAvailable?.(updates);
    }
  },

  renderPiUpdateStatus(status) {
    if (status?.state === "updating") {
      this.notifyPiUpdateRunning?.();
      this.startPiUpdatePolling?.();
    }
    if (status?.state === "updated") this.notifyPiUpdateComplete?.();
    if (status?.state === "failed") this.notifyPiUpdateFailed?.(status.error);
  },

  async startPiUpdateFlow(source = "", workspaceId = "") {
    try {
      this.renderPiUpdateStatus(await startPiUpdate(source, workspaceId));
      this.startPiUpdatePolling?.();
    } catch (error) {
      this.notifyPiUpdateFailed?.(error?.message || String(error));
    }
  },

  startPiUpdatePolling() {
    if (this.piUpdateTimer) return;
    this.piUpdateTimer = setInterval(async () => {
      try {
        const status = await getPiUpdateStatus();
        this.renderPiUpdateStatus(status);
        if (status?.state !== "updating") {
          clearInterval(this.piUpdateTimer);
          this.piUpdateTimer = undefined;
        }
      } catch {}
    }, 3000);
  },

  isPiUpdateIgnored(current, latest) {
    try {
      return localStorage.getItem(IGNORED_PI_UPDATE_KEY) === `${current}:${latest}`;
    } catch {
      return false;
    }
  },

  rememberIgnoredPiUpdate(current, latest) {
    try {
      localStorage.setItem(IGNORED_PI_UPDATE_KEY, `${current}:${latest}`);
    } catch {}
  },

  isPiPackageUpdateIgnored(key) {
    try {
      return ignoredPackageUpdates(localStorage.getItem(IGNORED_PI_PACKAGE_UPDATE_KEY)).includes(key);
    } catch {
      return false;
    }
  },

  rememberIgnoredPiPackageUpdate(key) {
    try {
      const next = new Set(ignoredPackageUpdates(localStorage.getItem(IGNORED_PI_PACKAGE_UPDATE_KEY)));
      next.add(key);
      localStorage.setItem(IGNORED_PI_PACKAGE_UPDATE_KEY, JSON.stringify([...next]));
    } catch {}
  },

  showUpdateTip() {
    const tip = this.querySelector("[data-update-tip]");
    if (!tip) return;
    tip.hidden = false;
    clearTimeout(this.updateTipTimer);
    this.updateTipTimer = setTimeout(() => {
      tip.hidden = true;
    }, 5000);
  },
};
