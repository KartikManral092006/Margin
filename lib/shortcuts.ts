export type KeyEventInfo = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
  targetTag: string | null;
  targetEditable: boolean;
};

// A single-letter room shortcut (D, L): a bare key press, never while typing in a field, with a
// modifier (browser shortcuts) or mid-composition (IME input).
export function isLetterShortcut(event: KeyEventInfo, letter: string): boolean {
  if (event.key.toLowerCase() !== letter) return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false;
  if (event.targetEditable) return false;
  const tag = event.targetTag?.toUpperCase() ?? null;
  return tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT";
}

export function keyEventInfo(event: KeyboardEvent): KeyEventInfo {
  const target = event.target instanceof HTMLElement ? event.target : null;
  return {
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    isComposing: event.isComposing,
    targetTag: target?.tagName ?? null,
    targetEditable: target?.isContentEditable ?? false,
  };
}
