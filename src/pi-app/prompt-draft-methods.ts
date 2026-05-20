import { PROMPT_DRAFT_STORAGE_KEY } from "./constants";

export const promptDraftMethods = {
  restorePromptDraft() {
    if (!this.prompt) return;
    try {
      const draft = localStorage.getItem(PROMPT_DRAFT_STORAGE_KEY);
      if (draft !== null) this.prompt.value = draft;
    } catch {}
  },

  savePromptDraft() {
    if (!this.prompt) return;
    try {
      const draft = this.prompt.value;
      if (draft) localStorage.setItem(PROMPT_DRAFT_STORAGE_KEY, draft);
      else localStorage.removeItem(PROMPT_DRAFT_STORAGE_KEY);
    } catch {}
  },

  clearPromptDraft() {
    try {
      localStorage.removeItem(PROMPT_DRAFT_STORAGE_KEY);
    } catch {}
  },
};
