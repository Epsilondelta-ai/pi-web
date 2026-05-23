import { getVersionStatus } from "../../lib/api";

export const versionMethods = {
  async loadVersionStatus() {
    try {
      const status = await getVersionStatus();
      this.renderVersionStatus(status);
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
