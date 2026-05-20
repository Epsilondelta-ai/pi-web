const TOAST_MESSAGES = {
  success: {
    title: "응답 완료",
    detail: "세션 응답이 완료되었습니다.",
  },
  choice: {
    title: "선택지 요청",
    detail: "세션에서 선택지 질문을 요청했습니다.",
  },
  error: {
    title: "응답 실패",
    detail: "답변을 받는데 실패했습니다.",
  },
};

function toastText(kind, detail) {
  const message = TOAST_MESSAGES[kind] || TOAST_MESSAGES.success;
  return {
    title: message.title,
    detail: detail || message.detail,
  };
}

export const toastMethods = {
  ensureToastRegion() {
    if (this.toastRegion?.isConnected) return this.toastRegion;
    const region = document.createElement("section");
    region.className = "toast-region";
    region.dataset.toastRegion = "";
    region.setAttribute("aria-label", "session notifications");
    region.setAttribute("aria-live", "polite");
    region.innerHTML = [
      `<button class="toast-dismiss-all" type="button" data-action="dismiss-all-toasts" hidden>전체 닫기</button>`,
      `<div class="toast-list" data-toast-list></div>`,
    ].join("");
    region.addEventListener("click", (event) => this.handleToastClick(event));
    (this.querySelector("[data-main='session']") || this).append(region);
    this.toastRegion = region;
    return region;
  },

  handleToastClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target || !this.toastRegion?.contains(target)) return;
    if (target.dataset.action === "dismiss-all-toasts") this.dismissAllToasts();
    if (target.dataset.action === "dismiss-toast") this.dismissToast(target.closest(".session-toast"));
  },

  showToast(kind, detail) {
    const region = this.ensureToastRegion();
    const list = region.querySelector("[data-toast-list]");
    if (!list) return undefined;
    const toast = document.createElement("button");
    const message = toastText(kind, detail);
    toast.type = "button";
    toast.className = `session-toast ${kind}`;
    toast.dataset.action = "dismiss-toast";
    toast.innerHTML = [
      `<span class="toast-dot" aria-hidden="true"></span>`,
      `<span class="toast-copy"><strong></strong><small></small></span>`,
    ].join("");
    toast.querySelector("strong").textContent = message.title;
    toast.querySelector("small").textContent = message.detail;
    list.prepend(toast);
    this.syncToastDismissAll();
    return toast;
  },

  dismissToast(toast) {
    toast?.remove();
    this.syncToastDismissAll();
  },

  dismissAllToasts() {
    this.toastRegion?.querySelectorAll(".session-toast").forEach((toast) => toast.remove());
    this.syncToastDismissAll();
  },

  syncToastDismissAll() {
    const toasts = this.toastRegion?.querySelectorAll(".session-toast") ?? [];
    const dismissAll = this.toastRegion?.querySelector(".toast-dismiss-all");
    dismissAll?.toggleAttribute("hidden", toasts.length < 2);
  },

  notifySessionCompleted() {
    this.showToast("success");
  },

  notifyChoiceRequested() {
    this.showToast("choice");
  },

  notifyResponseFailure(detail) {
    if (this.responseFailureToastShown) return;
    this.responseFailureToastShown = true;
    this.showToast("error", detail);
  },
};
