import {
  getAuthProviders,
  getOAuthLoginSession,
  getOAuthProviders,
  sendOAuthLoginInput,
  startOAuthLogin,
} from "../../lib/api";

export const oauthMethods = {
  fillOAuthForm() {
    const providerSelect = this.querySelector("[data-oauth-provider]");
    if (!providerSelect || !this.oauthState?.providers) return;
    const previousValue = providerSelect.value;
    const options = this.oauthState.providers.map((provider) => {
      const option = document.createElement("option");
      option.value = provider.id;
      option.textContent = provider.configured ? `${provider.name} ✓` : provider.name;
      return option;
    });
    providerSelect.replaceChildren(...options);
    if (previousValue && this.oauthState.providers.some((provider) => provider.id === previousValue)) {
      providerSelect.value = previousValue;
    }
  },

  async startOAuthLogin() {
    const provider = this.querySelector("[data-oauth-provider]")?.value;
    if (!provider || !this.apiConnected) return;
    const button = this.querySelector("[data-action='start-oauth-login']");
    button && (button.disabled = true);
    this.setOAuthStatus("starting OAuth login…");
    try {
      const { session } = await startOAuthLogin(provider);
      this.oauthSessionId = session.id;
      this.applyOAuthSession(session);
      this.pollOAuthSession(session.id);
    } catch (error) {
      button && (button.disabled = false);
      this.setOAuthStatus(error instanceof Error ? error.message : String(error), true);
      this.setConnection("err");
    }
  },

  async pollOAuthSession(sessionId) {
    if (!sessionId) return;
    const terminal = new Set(["success", "error"]);
    while (this.oauthSessionId === sessionId) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const { session } = await getOAuthLoginSession(sessionId);
        this.applyOAuthSession(session);
        if (terminal.has(session.status)) break;
      } catch (error) {
        this.setOAuthStatus(error instanceof Error ? error.message : String(error), true);
        break;
      }
    }
  },

  applyOAuthSession(session) {
    const link = this.querySelector("[data-oauth-link]");
    const input = this.querySelector("[data-oauth-input]");
    const send = this.querySelector("[data-action='send-oauth-input']");
    if (link) {
      link.hidden = !session.authUrl;
      if (session.authUrl) link.href = session.authUrl;
    }
    if (input && send) {
      const needsInput = Boolean(session.prompt);
      input.hidden = !needsInput;
      send.hidden = !needsInput;
      input.placeholder = session.prompt?.placeholder || session.prompt?.message || "prompt input or redirect URL";
    }
    if (session.status === "success") {
      this.oauthSessionId = "";
      const button = this.querySelector("[data-action='start-oauth-login']");
      button && (button.disabled = false);
      this.setOAuthStatus("OAuth login saved");
      void this.refreshAuthAfterOAuth();
      return;
    }
    if (session.status === "error") {
      this.oauthSessionId = "";
      const button = this.querySelector("[data-action='start-oauth-login']");
      button && (button.disabled = false);
      this.setOAuthStatus(session.error || "OAuth login failed", true);
      return;
    }
    const latestProgress = session.progress?.at?.(-1);
    this.setOAuthStatus(session.prompt?.message || session.instructions || latestProgress || `OAuth ${session.status}`);
  },

  async sendOAuthInput() {
    const sessionId = this.oauthSessionId;
    const input = this.querySelector("[data-oauth-input]");
    if (!sessionId || !input) return;
    try {
      const { session } = await sendOAuthLoginInput(sessionId, input.value);
      input.value = "";
      this.applyOAuthSession(session);
    } catch (error) {
      this.setOAuthStatus(error instanceof Error ? error.message : String(error), true);
    }
  },

  async refreshAuthAfterOAuth() {
    this.authState = await getAuthProviders();
    this.oauthState = await getOAuthProviders();
    this.fillAuthForm();
    this.fillOAuthForm();
    void this.loadRuntimeStatus?.(this.dataset.activeWorkspaceId);
  },

  setOAuthStatus(message, error = false) {
    const status = this.querySelector("[data-oauth-status]");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("err", error);
  },
};
