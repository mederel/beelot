// The message queue of the card table (US-119): one toast on screen, a higher priority replaces it, the others wait. No
// DOM: the caller supplies `show`, `hide` and the timers.
export type ToastKind = "declaration" | "hint" | "detail";
export const TOAST_MS: Record<ToastKind, number> = { declaration: 2500, hint: 4000, detail: 6000 };
export const TOAST_PRIORITY: Record<ToastKind, number> = { declaration: 1, hint: 2, detail: 3 };
const MAX_WAITING = 3;

interface Toast {
  text: string;
  kind: ToastKind;
}

export function makeToaster({ show, hide, setTimer, clearTimer }: { show: (text: string, kind: ToastKind) => void; hide: () => void; setTimer: (callback: () => void, ms: number) => unknown; clearTimer: (timer: any) => void }) {
  let shown: Toast | null = null;
  let timer: unknown = null;
  let waiting: Toast[] = [];

  function display(toast: Toast) {
    shown = toast;
    show(toast.text, toast.kind);
    timer = setTimer(next, TOAST_MS[toast.kind]);
  }

  function next() {
    timer = null;
    shown = null;
    hide();
    const toast = waiting.shift();
    if (toast) display(toast);
  }

  return {
    push(text: string, kind: ToastKind) {
      if (typeof text !== "string" || !text.trim()) return;
      if (shown && shown.text === text) return;
      if (waiting.some((toast) => toast.text === text)) return;
      const toast = { text, kind };
      if (!shown) return display(toast);
      if (TOAST_PRIORITY[kind] > TOAST_PRIORITY[shown.kind]) {
        clearTimer(timer);
        return display(toast);
      }
      waiting.push(toast);
      if (waiting.length > MAX_WAITING) waiting.shift();
    },
    clear() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      waiting = [];
      if (shown) hide();
      shown = null;
    },
    current(): Toast | null {
      return shown ? { text: shown.text, kind: shown.kind } : null;
    }
  };
}
