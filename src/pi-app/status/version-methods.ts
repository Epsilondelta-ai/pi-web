import { getPiUpdateStatus, getPiVersionStatus, getVersionStatus, startPiUpdate } from "../../lib/api";

const IGNORED_PI_UPDATE_KEY = "piweb:ignored-pi-update";

export const versionMethods = {
  async loadVersionStatus() {
    try {
      const [webStatus, piStatus, updateStatus] = await Promise.allSettled([
        getVersionStatus(),
        getPiVersionStatus(),
        getPiUpdateStatus(),
      ]);
      if (webStatus.status === "fulfilled") this.renderVersionStatus(webStatus.value);
      if (updateStatus.status === "fulfilled") this.renderPiUpdateStatus(updateStatus.value);
      if (piStatus.status === "fulfilled") this.renderPiVersionStatus(piStatus.value);
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

  renderPiUpdateStatus(status) {
    if (status?.state === "updating") this.notifyPiUpdateRunning?.();
    if (status?.state === "updated") this.notifyPiUpdateComplete?.();
    if (status?.state === "failed") this.notifyPiUpdateFailed?.(status.error);
  },

  async startPiUpdateFlow() {
    try {
      this.renderPiUpdateStatus(await startPiUpdate());
      this.startPiUpdatePolling?.();
    } catch (error) {
      this.notifyPiUpdateFailed?.(error?.message || String(error));
    }
  },

  startPiUpdatePolling() {
    if (this.piUpdateTimer) clearInterval(this.piUpdateTimer);
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
