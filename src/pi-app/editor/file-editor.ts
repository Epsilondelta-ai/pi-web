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
import { diff } from "@codemirror/merge";
import { findNext, findPrevious, search, SearchQuery, searchKeymap, setSearchQuery } from "@codemirror/search";
import { EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import type { Extension, Text } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLineGutter,
  GutterMarker,
  gutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { codeMirrorLanguageName, type FileLike } from "./file-editor-state";
export { codeMirrorLanguageName, editableFileState, fileExtensionFromName, MAX_EDITABLE_BYTES } from "./file-editor-state";

export type FileEditorOptions = {
  file: FileLike;
  content: string;
  originalContent?: string;
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

    this.parent.append(this.createSearchToolbar());
    this.view = new EditorView({
      parent: this.parent,
      state: EditorState.create({
        doc: options.content,
        extensions: editorExtensions(
          options.file,
          !!options.readOnly,
          options.originalContent ?? options.content,
          this.saveKeymap,
          this.changeListener,
        ),
      }),
    });
  }

  private createSearchToolbar() {
    const toolbar = document.createElement("div");
    toolbar.className = "fp-editor-search";
    toolbar.setAttribute("role", "search");

    const label = document.createElement("span");
    label.textContent = "검색";

    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "파일 검색";
    input.setAttribute("aria-label", "search file content");

    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "↑";
    previous.setAttribute("aria-label", "previous search match");

    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "↓";
    next.setAttribute("aria-label", "next search match");

    const applySearch = () => {
      const view = this.view;
      if (!view) return;
      view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: input.value })) });
    };
    const move = (direction: "next" | "previous") => {
      applySearch();
      const view = this.view;
      if (!view || !input.value) return;
      (direction === "next" ? findNext : findPrevious)(view);
      view.focus();
    };

    input.addEventListener("input", applySearch);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      move(event.shiftKey ? "previous" : "next");
    });
    previous.addEventListener("click", () => move("previous"));
    next.addEventListener("click", () => move("next"));

    toolbar.append(label, input, previous, next);
    return toolbar;
  }
}

export function codeMirrorLanguageExtension(file: FileLike): Extension[] {
  const name = (file.path || "").split("/").pop()?.toLowerCase() || "";
  const extension = name.includes(".") ? name.split(".").pop() as string : "";
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

function editorExtensions(file: FileLike, readOnly: boolean, originalContent: string, ...extra: Extension[]): Extension[] {
  const changeIndicator = readOnly ? [] : gitChangeGutter(originalContent);

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
    ...changeIndicator,
    ...codeMirrorLanguageExtension(file),
    keymap.of([indentWithTab, ...searchKeymap, ...historyKeymap, ...defaultKeymap]),
    ...extra,
  ];
}

class GitChangeMarker extends GutterMarker {
  constructor(private kind: "added" | "modified" | "deleted") {
    super();
  }

  toDOM() {
    const marker = document.createElement("span");
    marker.className = `cm-gitChangeMarker cm-git-${this.kind}`;
    marker.title = this.kind;
    return marker;
  }
}

const gitMarkers = {
  added: new GitChangeMarker("added"),
  modified: new GitChangeMarker("modified"),
  deleted: new GitChangeMarker("deleted"),
};

function gitChangeGutter(originalContent: string): Extension[] {
  const field = StateField.define({
    create: (state) => buildGitChangeMarkers(originalContent, state.doc),
    update: (markers, transaction) => transaction.docChanged ? buildGitChangeMarkers(originalContent, transaction.state.doc) : markers,
  });
  return [field, gutter({ class: "cm-gitChangeGutter", markers: (view) => view.state.field(field) })];
}

export function buildGitChangeMarkers(originalContent: string, doc: Text) {
  const builder = new RangeSetBuilder<GitChangeMarker>();
  for (const change of diff(originalContent, doc.toString())) {
    if (change.fromB === change.toB) {
      addLineMarker(builder, doc, change.fromB, "deleted");
    } else {
      const kind = change.fromA === change.toA ? "added" : "modified";
      addLineMarkers(builder, doc, change.fromB, change.toB, kind);
    }
  }
  return builder.finish();
}

export function addLineMarkers(
  builder: RangeSetBuilder<GitChangeMarker>,
  doc: Text,
  from: number,
  to: number,
  kind: "added" | "modified" | "deleted",
) {
  const docEnd = doc.length;
  const start = Math.max(0, Math.min(from, docEnd));
  const end = Math.max(start, Math.min(to, docEnd));
  if (start === end) {
    addLineMarker(builder, doc, start, kind);
    return;
  }
  const firstLine = doc.lineAt(start).number;
  const lastLine = doc.lineAt(Math.max(start, end - 1)).number;
  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
    const line = doc.line(lineNumber);
    builder.add(line.from, line.from, gitMarkers[kind]);
  }
}

function addLineMarker(
  builder: RangeSetBuilder<GitChangeMarker>,
  doc: Text,
  position: number,
  kind: "added" | "modified" | "deleted",
) {
  const safePosition = Math.max(0, Math.min(position, doc.length));
  const line = doc.lineAt(safePosition);
  builder.add(line.from, line.from, gitMarkers[kind]);
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
        color: "var(--fg-3)",
        borderRight: "1px solid var(--border-dim)",
      },
      ".cm-activeLineGutter, .cm-activeLine": { backgroundColor: "rgba(255,255,255,0.045)" },
      ".cm-gitChangeGutter": { width: "4px", paddingLeft: "0", backgroundColor: "var(--bg-0)" },
      ".cm-gitChangeMarker": { display: "block", width: "3px", height: "100%", minHeight: "1.5em" },
      ".cm-gitChangeMarker.cm-git-added": { backgroundColor: "var(--accent)" },
      ".cm-gitChangeMarker.cm-git-modified": { backgroundColor: "#d6b25e" },
      ".cm-gitChangeMarker.cm-git-deleted": { backgroundColor: "var(--danger)" },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(0,255,136,0.24)" },
      ".cm-cursor": { borderLeftColor: "var(--accent)" },
      ".cm-panels": { backgroundColor: "var(--bg-2)", color: "var(--fg-1)" },
      ".cm-panels input": { backgroundColor: "var(--bg-0)", color: "var(--fg-1)", border: "1px solid var(--border)" },
    },
    { dark: true },
  );
}

