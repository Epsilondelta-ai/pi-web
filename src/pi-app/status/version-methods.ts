import {
  getPiPackageUpdateStatus,
  getPiUpdateStatus,
  getPiVersionStatus,
  getVersionStatus,
  startPiUpdate,
} from "../../shared/api/api";

const IGNORED_PI_UPDATE_KEY = "piweb:ignored-pi-update";
const IGNORED_PI_PACKAGE_UPDATE_KEY = "piweb:ignored-pi-package-update";

type PackageUpdateStatus = {
  scope?: string;
  updates?: unknown[];
  workspaceId?: string;
};

type PiUpdateStatus = {
  error?: string;
  state?: string;
};

type VersionUpdateStatus = {
  currentVersion?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
};

function ignoredPackageUpdates(raw: string | null): string[] {
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
      const packageStatus: PackageUpdateStatus = await getPiPackageUpdateStatus(workspaceId);
      packageStatus.workspaceId = workspaceId;
      this.renderPiPackageUpdateStatus(packageStatus);
    } catch {}
  },

  renderVersionStatus(status: VersionUpdateStatus) {
    const buttons = this.querySelectorAll("[data-action='show-update-tip']") as NodeListOf<HTMLElement>;
    const panels = this.querySelectorAll("[data-update-release-panel]") as NodeListOf<HTMLElement>;
    if (!buttons.length && !panels.length) return;

    const updateAvailable: boolean = !!status?.updateAvailable && status?.latestVersion !== status?.currentVersion;
    const currentVersion: string = status?.currentVersion || "current";
    const latestVersion: string = status?.latestVersion || "latest";
    panels.forEach((panel) => {
      panel.hidden = !updateAvailable;
      panel.querySelectorAll<HTMLElement>("[data-update-current]").forEach((current: HTMLElement) => {
        current.textContent = currentVersion;
      });
      panel.querySelectorAll<HTMLElement>("[data-update-latest]").forEach((latest: HTMLElement) => {
        latest.textContent = latestVersion;
      });
      panel.querySelectorAll<HTMLElement>("[data-update-tip]").forEach((tip: HTMLElement) => {
        tip.hidden = !updateAvailable;
      });
    });
    buttons.forEach((button) => {
      button.hidden = !updateAvailable;

      if (updateAvailable) {
        button.title = `Current ${currentVersion}; latest ${latestVersion}`;
      }
    });

    if (updateAvailable) {
      this.notifyUpdateAvailable?.(status);
    }
  },

  renderPiVersionStatus(status: VersionUpdateStatus) {
    if (!status?.updateAvailable || status?.latestVersion === status?.currentVersion) return;
    this.notifyPiUpdateAvailable?.(status);
  },

  renderPiPackageUpdateStatus(status: PackageUpdateStatus) {
    const updates: unknown[] = Array.isArray(status?.updates) ? status.updates : [];
    if (!updates.length) return;
    if (status?.scope === "workspace") {
      this.notifyWorkspacePackageUpdateAvailable?.(updates, status.workspaceId);
    } else {
      this.notifyPiPackageUpdateAvailable?.(updates);
    }
  },

  renderPiUpdateStatus(status: PiUpdateStatus) {
    if (status?.state === "updating") {
      this.notifyPiUpdateRunning?.();
      this.startPiUpdatePolling?.();
    }
    if (status?.state === "updated") this.notifyPiUpdateComplete?.();
    if (status?.state === "failed") this.notifyPiUpdateFailed?.(status.error);
  },

  async startPiUpdateFlow(source: string = "", workspaceId: string = "") {
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
        const status: PiUpdateStatus = await getPiUpdateStatus();
        this.renderPiUpdateStatus(status);
        if (status?.state !== "updating") {
          clearInterval(this.piUpdateTimer);
          this.piUpdateTimer = undefined;
        }
      } catch {}
    }, 3000);
  },

  isPiUpdateIgnored(current: string, latest: string) {
    try {
      return localStorage.getItem(IGNORED_PI_UPDATE_KEY) === `${current}:${latest}`;
    } catch {
      return false;
    }
  },

  rememberIgnoredPiUpdate(current: string, latest: string) {
    try {
      localStorage.setItem(IGNORED_PI_UPDATE_KEY, `${current}:${latest}`);
    } catch {}
  },

  isPiPackageUpdateIgnored(key: string) {
    try {
      return ignoredPackageUpdates(localStorage.getItem(IGNORED_PI_PACKAGE_UPDATE_KEY)).includes(key);
    } catch {
      return false;
    }
  },

  rememberIgnoredPiPackageUpdate(key: string) {
    try {
      const next: Set<string> = new Set(ignoredPackageUpdates(localStorage.getItem(IGNORED_PI_PACKAGE_UPDATE_KEY)));
      next.add(key);
      localStorage.setItem(IGNORED_PI_PACKAGE_UPDATE_KEY, JSON.stringify([...next]));
    } catch {}
  },

  showUpdateTip() {
    const tips = this.querySelectorAll("[data-update-tip]") as NodeListOf<HTMLElement>;
    if (!tips.length) return;

    tips.forEach((tip) => {
      tip.hidden = false;
    });
    clearTimeout(this.updateTipTimer);
    this.updateTipTimer = setTimeout(() => {
      tips.forEach((tip) => {
        tip.hidden = true;
      });
    }, 5000);
  },
};
