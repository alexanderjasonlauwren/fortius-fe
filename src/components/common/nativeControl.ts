import type { ForwardedRef } from "react";

/**
 * Browser popups for <select> and <input type="date"> are drawn by the OS and
 * ignore the theme, so the console draws its own. A real, visually hidden
 * element stays underneath so callers keep the native contract unchanged:
 * `onChange(e)` with a real `e.target.value`, refs, `name`, and form data.
 *
 * The write goes through the prototype setter on purpose. React shadows
 * `value` on each <input> to remember what it last rendered; assigning through
 * that shadow updates React's memory too, so the event that follows looks like
 * no change and `onChange` never fires. (<select> has no shadow, but takes the
 * same path so there is one way to commit.)
 */
export function commitNativeValue(
  element: HTMLInputElement | HTMLSelectElement | null,
  next: string,
) {
  if (!element || element.value === next) return;
  const isSelect = element instanceof HTMLSelectElement;
  const prototype = isSelect ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, next);
  element.dispatchEvent(new Event(isSelect ? "change" : "input", { bubbles: true }));
}

export function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}
