export const sessionMenuMethods = {
  toggleSessionMenu(row) {
    if (!row) return;
    const menu = row.querySelector(".session-menu");
    const button = row.querySelector(".session-menu-button");
    const open = menu?.hidden;
    this.closeSessionMenus(row);
    menu?.toggleAttribute("hidden", !open);
    button?.setAttribute("aria-expanded", String(!!open));
  },

  closeSessionMenus(except) {
    this.querySelectorAll(".session-row").forEach((row) => {
      if (except && row === except) return;
      row.querySelector(".session-menu")?.setAttribute("hidden", "");
      row.querySelector(".session-menu-button")?.setAttribute("aria-expanded", "false");
    });
  },

  closeModals() {
    this.closeSessionMenus();
    this.closeFilePreview?.();
    this.closeSettingsModal?.();
  },
};
