import { z } from "zod";

export const SETTINGS_FIELDS = [
  { path: "defaultProvider", label: "Default provider", type: "providerSelect", hint: "provider id" },
  { path: "defaultModel", label: "Default model", type: "modelSelect", hint: "model id or provider/model" },
  { path: "defaultThinkingLevel", label: "Thinking level", type: "select", values: ["off", "minimal", "low", "medium", "high", "xhigh"] },
  { path: "compaction.enabled", label: "Auto-compact", type: "boolean" },
  { path: "enableSkillCommands", label: "Skill commands", type: "boolean" },
  { path: "steeringMode", label: "Steering mode", type: "select", values: ["one-at-a-time", "all"] },
  { path: "followUpMode", label: "Follow-up mode", type: "select", values: ["one-at-a-time", "all"] },
  { path: "hideThinkingBlock", label: "Hide thinking", type: "boolean" },
  { path: "readResponsesAloud", label: "Read responses aloud", type: "checkbox" },
  { path: "voice.language", label: "Voice language", type: "speechLanguage" },
  { path: "enableSpeechInput", label: "Speech input", type: "checkbox" },
  { path: "speechInput.language", label: "Speech language", type: "speechLanguage" },
  { path: "remoteNotifications.discord.enabled", label: "Discord enabled", type: "checkbox" },
  { path: "remoteNotifications.discord.token", label: "Discord token", type: "password", hint: "bot token" },
  { path: "remoteNotifications.discord.channelId", label: "Discord channel ID", type: "text", hint: "channel id" },
  { path: "remoteNotifications.telegram.enabled", label: "Telegram enabled", type: "checkbox" },
  { path: "remoteNotifications.telegram.token", label: "Telegram bot token", type: "password", hint: "BotFather token" },
  { path: "remoteNotifications.telegram.chatId", label: "Telegram chat ID", type: "text", hint: "chat_id" },
  { path: "warnings.anthropicExtraUsage", label: "Anthropic extra usage warning", type: "boolean" },
] as const;

export const settingsScopeSchema = z.enum(["global", "project"]);

const thinkingLevelSchema = z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]);
const steeringModeSchema = z.enum(["one-at-a-time", "all"]);
const transportSchema = z.enum(["sse", "websocket", "websocket-cached", "auto"]);
const doubleEscapeActionSchema = z.enum(["tree", "fork", "none"]);
const treeFilterModeSchema = z.enum(["default", "no-tools", "user-only", "labeled-only", "all"]);
const speechLanguageSchema = z.enum(["system", "en-US", "ko-KR", "ja-JP", "zh-CN"]);
const whisperModelSchema = z.enum([
  "tiny-q5",
  "tiny",
  "base-q5",
  "base",
  "small-q5",
  "small",
  "medium-q5",
  "medium",
  "large-v3-q5",
  "large-v3",
]);

const settingsObjectSchema = z.object({
  defaultProvider: z.string().optional(),
  defaultModel: z.string().optional(),
  defaultThinkingLevel: thinkingLevelSchema.optional(),
  theme: z.string().optional(),
  compaction: z.object({ enabled: z.boolean().optional() }).partial().passthrough().optional(),
  terminal: z.object({
    showImages: z.boolean().optional(),
    imageWidthCells: z.number().optional(),
    clearOnShrink: z.boolean().optional(),
    showTerminalProgress: z.boolean().optional(),
  }).partial().passthrough().optional(),
  images: z.object({
    autoResize: z.boolean().optional(),
    blockImages: z.boolean().optional(),
  }).partial().passthrough().optional(),
  enableSkillCommands: z.boolean().optional(),
  showHardwareCursor: z.boolean().optional(),
  editorPaddingX: z.number().optional(),
  autocompleteMaxVisible: z.number().optional(),
  steeringMode: steeringModeSchema.optional(),
  followUpMode: steeringModeSchema.optional(),
  transport: transportSchema.optional(),
  hideThinkingBlock: z.boolean().optional(),
  readResponsesAloud: z.boolean().optional(),
  voice: z.object({
    language: speechLanguageSchema.optional(),
  }).partial().passthrough().optional(),
  enableSpeechInput: z.boolean().optional(),
  speechInput: z.object({
    language: speechLanguageSchema.optional(),
    useLocalWhisper: z.boolean().optional(),
    whisperModel: whisperModelSchema.optional(),
  }).partial().passthrough().optional(),
  speechLanguage: speechLanguageSchema.optional(),
  collapseChangelog: z.boolean().optional(),
  quietStartup: z.boolean().optional(),
  enableInstallTelemetry: z.boolean().optional(),
  doubleEscapeAction: doubleEscapeActionSchema.optional(),
  treeFilterMode: treeFilterModeSchema.optional(),
  remoteNotifications: z.object({
    discord: z.object({
      enabled: z.boolean().optional(),
      token: z.string().optional(),
      channelId: z.string().optional(),
    }).partial().passthrough().optional(),
    telegram: z.object({
      enabled: z.boolean().optional(),
      token: z.string().optional(),
      chatId: z.string().optional(),
    }).partial().passthrough().optional(),
  }).partial().passthrough().optional(),
  warnings: z.object({ anthropicExtraUsage: z.boolean().optional() }).partial().passthrough().optional(),
}).partial().passthrough();

const nullishString = z.string().nullable().optional();
const nullishBoolean = z.boolean().nullable().optional();
const nullishNumber = z.number().nullable().optional();

export const settingsPatchSchema = z.object({
  defaultProvider: nullishString,
  defaultModel: nullishString,
  defaultThinkingLevel: thinkingLevelSchema.nullable().optional(),
  theme: nullishString,
  compaction: z.object({ enabled: nullishBoolean }).partial().passthrough().optional(),
  terminal: z.object({
    showImages: nullishBoolean,
    imageWidthCells: nullishNumber,
    clearOnShrink: nullishBoolean,
    showTerminalProgress: nullishBoolean,
  }).partial().passthrough().optional(),
  images: z.object({
    autoResize: nullishBoolean,
    blockImages: nullishBoolean,
  }).partial().passthrough().optional(),
  enableSkillCommands: nullishBoolean,
  showHardwareCursor: nullishBoolean,
  editorPaddingX: nullishNumber,
  autocompleteMaxVisible: nullishNumber,
  steeringMode: steeringModeSchema.nullable().optional(),
  followUpMode: steeringModeSchema.nullable().optional(),
  transport: transportSchema.nullable().optional(),
  hideThinkingBlock: nullishBoolean,
  readResponsesAloud: nullishBoolean,
  voice: z.object({
    language: speechLanguageSchema.nullable().optional(),
  }).partial().passthrough().optional(),
  enableSpeechInput: nullishBoolean,
  speechInput: z.object({
    language: speechLanguageSchema.nullable().optional(),
    useLocalWhisper: nullishBoolean,
    whisperModel: whisperModelSchema.nullable().optional(),
  }).partial().passthrough().optional(),
  speechLanguage: speechLanguageSchema.nullable().optional(),
  collapseChangelog: nullishBoolean,
  quietStartup: nullishBoolean,
  enableInstallTelemetry: nullishBoolean,
  doubleEscapeAction: doubleEscapeActionSchema.nullable().optional(),
  treeFilterMode: treeFilterModeSchema.nullable().optional(),
  remoteNotifications: z.object({
    discord: z.object({
      enabled: nullishBoolean,
      token: nullishString,
      channelId: nullishString,
    }).partial().passthrough().optional(),
    telegram: z.object({
      enabled: nullishBoolean,
      token: nullishString,
      chatId: nullishString,
    }).partial().passthrough().optional(),
  }).partial().passthrough().optional(),
  warnings: z.object({ anthropicExtraUsage: nullishBoolean }).partial().passthrough().optional(),
}).partial().passthrough();

export const workspaceSettingsSchema = z.object({
  global: settingsObjectSchema,
  project: settingsObjectSchema,
  effective: settingsObjectSchema,
  paths: z.object({
    global: z.string().optional(),
    project: z.string().optional(),
  }).partial().passthrough(),
}).passthrough();

export type SettingsField = (typeof SETTINGS_FIELDS)[number];
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

function validationMessage(prefix: string, error: z.ZodError) {
  const details = error.issues.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`).join("; ");
  return `${prefix}: ${details}`;
}

export function parseWorkspaceSettings(value: unknown): WorkspaceSettings {
  const result = workspaceSettingsSchema.safeParse(value);
  if (!result.success) throw new Error(validationMessage("invalid settings response", result.error));
  return result.data;
}

export function parseSettingsPatch(value: unknown): SettingsPatch {
  const result = settingsPatchSchema.safeParse(value);
  if (!result.success) throw new Error(validationMessage("invalid settings patch", result.error));
  return result.data;
}
