export interface TranscriptMessage {
  kind?: string;
  text?: string;
  delta?: string;
  [key: string]: unknown;
}

export interface TranscriptItem {
  id?: number | string;
  message?: TranscriptMessage;
  nodes?: Element[];
  height?: number;
}

export interface TranscriptVirtualState {
  items?: TranscriptItem[];
  itemHeights?: number[];
  itemStates?: unknown[];
  firstShownItemIndex?: number;
  lastShownItemIndex?: number;
  beforeItemsHeight?: number;
  afterItemsHeight?: number;
  columnsCount?: number;
  verticalSpacing?: number;
}

export interface TranscriptVirtualScrollerInstance {
  start?: () => void;
  stop?: () => void;
  setItems?: (items: TranscriptItem[], options: { preserveScrollPositionOnPrependItems: boolean }) => void;
  onItemHeightDidChange?: (item: TranscriptItem) => void;
  getState?: () => TranscriptVirtualState | undefined;
  virtualScroller?: {
    updateLayout?: () => void;
  };
}

export interface TranscriptScrollOptions {
  force?: boolean;
}

export interface TranscriptWheelEvent {
  deltaY?: number;
}

export interface TranscriptTouchEvent {
  touches?: ArrayLike<{ clientY?: number }>;
}

export interface TranscriptRenderOptions {
  preservePrepend?: boolean;
  stickToBottom?: boolean;
}

export interface TranscriptItemInit {
  nodes?: Element[];
}

export interface TranscriptWindowOwner {
  querySelector?: ParentNode["querySelector"];
  append?: ParentNode["append"];
  remove?: () => void;
  term?: HTMLElement | null;
  termInner?: HTMLElement | null;
  transcriptItems?: Array<TranscriptItem | undefined | null> | null;
  transcriptVisibleStart?: number;
  transcriptVisibleEnd?: number;
  transcriptFollowBottom?: boolean;
  transcriptLastScrollTop?: number;
  transcriptNextItemId?: number;
  transcriptResizeObservers?: Map<Element, ResizeObserver>;
  answeredChoiceIds?: Set<unknown>;
  transcriptScrollButton?: HTMLButtonElement | Element | null;
  transcriptScrollGuardInstalled?: boolean;
  transcriptVirtualScroller?: TranscriptVirtualScrollerInstance;
  transcriptVirtualScrollerStarted?: boolean;
  transcriptBottomFollowFramesRemaining?: number;
  transcriptBottomFollowStableFrames?: number;
  transcriptBottomFollowLastHeight?: number;
  transcriptFollowBaseline?: number;
  scrollFrame?: number;
  transcriptLastTouchY?: number;
  sessionHistoryHasMore?: boolean;
  sessionHistoryLoading?: boolean;
  running?: boolean;
  deferTranscriptRender?: boolean;
  ensureTranscriptScrollButton?: () => HTMLButtonElement | Element;
  installTranscriptScrollGuard?: () => void;
  handleTranscriptScroll?: () => void;
  handleTranscriptUserWheel?: (event?: TranscriptWheelEvent) => void;
  handleTranscriptTouchStart?: (event?: TranscriptTouchEvent) => void;
  handleTranscriptTouchMove?: (event?: TranscriptTouchEvent) => void;
  adoptRenderedTranscript?: () => void;
  updateTranscriptScrollButton?: () => void;
  destroyTranscriptVirtualScroller?: () => void;
  createTranscriptItem?: (message?: TranscriptMessage, options?: TranscriptItemInit) => TranscriptItem;
  renderTranscriptWindow?: (options?: TranscriptRenderOptions) => void;
  shouldRenderFullTranscriptWindow?: () => boolean;
  shouldStickToBottom?: () => boolean;
  scrollTerm?: (options?: TranscriptScrollOptions) => void;
  scrollTermToBottomImmediately?: () => void;
  startFollowingTranscriptBottom?: () => void;
  stopFollowingTranscriptBottom?: () => void;
  scheduleTranscriptBottomFollowFrame?: () => void;
  updateTranscriptBottomFollowStability?: () => void;
  shouldContinueTranscriptBottomFollow?: () => boolean;
  followTranscriptBottomOnce?: () => boolean;
  isTermPinnedToBottom?: () => boolean;
  isTranscriptVirtualized?: () => boolean;
  isTranscriptItemVisible?: (item?: TranscriptItem | null) => boolean;
  isTranscriptItemVisibleInScroller?: (item?: TranscriptItem | null) => boolean;
  measureTranscriptItem?: (item: TranscriptItem | null | undefined, element: Element) => boolean;
  notifyTranscriptItemHeightDidChange?: (item?: TranscriptItem | null, element?: Element | null) => void;
  notifyTranscriptNodeHeightDidChange?: (node?: Element | null) => void;
  transcriptElementNodes?: (node?: Node | null) => Element[];
  transcriptItemNodes?: (index: number) => Element[];
  transcriptItemHeight?: (index: number) => number;
  transcriptRangeHeight?: (start: number, end: number) => number;
  messageNode?: (message?: TranscriptMessage) => Node;
  renderVirtualTranscriptItem?: (item: TranscriptItem) => Node;
  applyTranscriptVirtualState?: (state: TranscriptVirtualState) => void;
  measureRenderedTranscriptItems?: () => void;
  syncRenderedTranscriptItemHeights?: () => void;
  scheduleTranscriptWindowRender?: () => void;
  scrollTranscriptToBottom?: () => void;
  loadOlderSessionMessages?: () => Promise<unknown> | unknown;
  syncAnsweredChoices?: () => void;
  ensureTranscriptVirtualScrollerStarted?: () => void;
  shouldLoadOlderTranscriptMessages?: () => boolean;
}
