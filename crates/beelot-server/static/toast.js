// The message queue of the card table (US-119): one toast on screen, a higher priority replaces it, the others wait.
// It touches no DOM: the caller supplies `show`, `hide` and the timers.
const TOAST_MS = { declaration: 2500, hint: 4000, detail: 6000 };
const TOAST_PRIORITY = { declaration: 1, hint: 2, detail: 3 };
const MAX_WAITING = 3;

function makeToaster({ show, hide, setTimer, clearTimer }) {
  let shown = null;
  let timer = null;
  let waiting = [];

  function display(toast) {
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
    push(text, kind) {
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
    current() {
      return shown ? { text: shown.text, kind: shown.kind } : null;
    }
  };
}

if (typeof module !== "undefined") module.exports = { makeToaster, TOAST_MS, TOAST_PRIORITY };
