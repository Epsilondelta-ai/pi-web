import { history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { search, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";

const SHELL_FILENAMES = new Set([".env", ".envrc", ".bashrc", ".zshrc", ".profile"]);
const SHELL_EXTENSIONS = new Set(["bash", "csh", "env", "fish", "sh", "zsh"]);
const MAX_EDITABLE_BYTES = 256 * 1024;

type FileLike = {
  path?: string;
  mime?: string;
  previewKind?: string;
  content?: string;
  truncated?: boolean;
};

export type EditableFileState = {
  editable: boolean;
  readOnly: boolean;
  reason: "editable" | "loading" | "error" | "image" | "binary" | "large" | "missing";
};

export type FileEditorOptions = {
  file: FileLike;
  content: string;
  readOnly?: boolean;
  onChange?: (content: string) => void;
  onSave?: () => void;
};

export class CodeMirrorFileEditor {
  private view?: EditorView;
  private saveKeymap?: Extension;
  private changeListener?: Extension;

  constructor(private parent: HTMLElement, options: FileEditorOptions) {
    this.mount(options);
  }

  update(options: FileEditorOptions) {
    this.destroy();
    this.mount(options);
  }

  focus() {
    this.view?.focus();
  }

  getValue() {
    return this.view?.state.doc.toString() || "";
  }

  destroy() {
    this.view?.destroy();
    this.view = undefined;
    this.parent.replaceChildren();
  }

  private mount(options: FileEditorOptions) {
    this.parent.classList.add("fp-code-editor", "fp-codemirror-editor");
    this.saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          options.onSave?.();
          return true;
        },
      },
    ]);
    this.changeListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange?.(update.state.doc.toString());
    });

    this.view = new EditorView({
      parent: this.parent,
      state: EditorState.create({
        doc: options.content,
        extensions: editorExtensions(options.file, !!options.readOnly, this.saveKeymap, this.changeListener),
      }),
    });
  }
}

export function editableFileState(file: FileLike): EditableFileState {
  if (file.previewKind === "loading") return { editable: false, readOnly: true, reason: "loading" };
  if (file.previewKind === "error") return { editable: false, readOnly: true, reason: "error" };
  if (file.truncated) return { editable: false, readOnly: true, reason: "large" };
  if (typeof file.content !== "string" && file.previewKind !== "image") {
    return { editable: false, readOnly: true, reason: "missing" };
  }
  if (isTextFile(file)) return { editable: true, readOnly: false, reason: "editable" };
  if (file.previewKind === "image") return { editable: false, readOnly: true, reason: "image" };
  return { editable: false, readOnly: true, reason: "binary" };
}

export function isTextFile(file: FileLike) {
  return file.previewKind === "text" || file.mime === "image/svg+xml";
}

export function codeMirrorLanguageName(file: FileLike) {
  const mime = file.mime || "";
  if (mime === "application/json") return "json";
  if (mime === "image/svg+xml" || mime.endsWith("+xml")) return "html";
  if (mime === "text/html") return "html";
  if (mime === "text/css") return "css";

  const name = basename(file).toLowerCase();
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile" || name === "justfile") return "makefile";
  if (SHELL_FILENAMES.has(name)) return "shell";

  const extension = name.includes(".") ? name.split(".").pop() || "" : "";
  if (["js", "mjs", "cjs", "jsx"].includes(extension)) return "javascript";
  if (["ts", "mts", "cts", "tsx"].includes(extension)) return "typescript";
  if (["json", "jsonc", "ipynb"].includes(extension)) return "json";
  if (["md", "markdown", "mdx"].includes(extension)) return "markdown";
  if (["html", "htm", "astro", "svelte", "vue"].includes(extension)) return "html";
  if (["css", "less", "scss"].includes(extension)) return "css";
  if (extension === "go") return "go";
  if (SHELL_EXTENSIONS.has(extension)) return "shell";
  return "text";
}

export function codeMirrorLanguageExtension(file: FileLike): Extension[] {
  const name = basename(file).toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() || "" : "";
  switch (codeMirrorLanguageName(file)) {
    case "javascript":
      return [javascript({ jsx: extension === "jsx" })];
    case "typescript":
      return [javascript({ typescript: true, jsx: extension === "tsx" })];
    case "json":
      return [json()];
    case "markdown":
      return [markdown()];
    case "html":
      return [html()];
    case "css":
      return [css()];
    case "go":
      return [go()];
    case "shell":
      return [StreamLanguage.define(shell)];
    default:
      return [];
  }
}

function editorExtensions(file: FileLike, readOnly: boolean, ...extra: Extension[]): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    history(),
    search({ top: true }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorState.tabSize.of(2),
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    EditorView.lineWrapping,
    piEditorTheme(),
    ...codeMirrorLanguageExtension(file),
    keymap.of([indentWithTab, ...searchKeymap, ...historyKeymap, ...defaultKeymap]),
    ...extra,
  ];
}

function piEditorTheme() {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        minHeight: "100%",
        backgroundColor: "var(--bg-0)",
        color: "var(--fg-1)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-xs)",
      },
      ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.5" },
      ".cm-content": { padding: "10px 0", caretColor: "var(--fg-0)" },
      ".cm-line": { padding: "0 10px" },
      ".cm-gutters": {
        backgroundColor: "var(--bg-0)",
        color: "var(--fg-4)",
        borderRight: "1px solid var(--border-dim)",
      },
      ".cm-activeLineGutter, .cm-activeLine": { backgroundColor: "rgba(255,255,255,0.045)" },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(0,255,136,0.24)" },
      ".cm-cursor": { borderLeftColor: "var(--accent)" },
      ".cm-panels": { backgroundColor: "var(--bg-2)", color: "var(--fg-1)" },
      ".cm-panels input": { backgroundColor: "var(--bg-0)", color: "var(--fg-1)", border: "1px solid var(--border)" },
    },
    { dark: true },
  );
}

function basename(file: FileLike) {
  return (file.path || "").split("/").pop() || "";
}

export { MAX_EDITABLE_BYTES };
