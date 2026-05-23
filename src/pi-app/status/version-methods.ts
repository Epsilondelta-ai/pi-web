import { getPiVersionStatus, getVersionStatus } from "../../lib/api";

export const versionMethods = {
  async loadVersionStatus() {
    try {
      const [webStatus, piStatus] = await Promise.allSettled([getVersionStatus(), getPiVersionStatus()]);
      if (webStatus.status === "fulfilled") this.renderVersionStatus(webStatus.value);
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
