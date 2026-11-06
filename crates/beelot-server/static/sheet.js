// Sheets (US-116): a native <dialog data-sheet> gives the focus trap, the inert page behind it and Escape. This adds what
// the browser does not: the focus goes back to the control that opened it, a drag on the grabber closes it, and one
// that must not be dismissed (the pass-and-play cover) stays open.

// Where a drag ends: closed when it went far enough or fast enough, otherwise the sheet springs back.
function dragOutcome({ distance, height, speed }) {
  return distance > 0.3 * height || speed > 0.5 ? "close" : "back";
}

function makeSheets({ document, history }) {
  const open = new Map();
  const wired = new WeakSet();

  // Ends a sheet's life: forgets it, closes the dialog if it is still open, then returns the focus unless told not to.
  function finish(dialog, restoreFocus) {
    const state = open.get(dialog);
    if (!state) return;
    open.delete(dialog);
    if (dialog.open) dialog.close();
    if (restoreFocus) {
      if (state.opener && document.contains(state.opener)) state.opener.focus();
      else document.querySelector("main")?.focus();
    }
    state.onClose();
  }

  function closeSheet(dialog) {
    finish(dialog, true);
  }

  function wire(dialog) {
    if (wired.has(dialog)) return;
    wired.add(dialog);
    dialog.addEventListener("cancel", (event) => {
      if (open.get(dialog)?.dismissible === false) event.preventDefault();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog && open.get(dialog)?.dismissible) closeSheet(dialog);
    });
    // The browser closed the dialog by itself (Escape): a dismissible sheet ends, the other one is shown again.
    dialog.addEventListener("close", () => {
      const state = open.get(dialog);
      if (!state) return;
      if (state.dismissible) finish(dialog, true);
      else dialog.showModal();
    });
    wireDrag(dialog);
  }

  function wireDrag(dialog) {
    const grabber = dialog.querySelector?.(".sheet-grabber");
    if (!grabber) return;
    let drag = null;
    grabber.addEventListener("pointerdown", (event) => {
      if (!open.get(dialog)?.dismissible) return;
      grabber.setPointerCapture?.(event.pointerId);
      drag = { startY: event.clientY, startTime: event.timeStamp, distance: 0 };
    });
    grabber.addEventListener("pointermove", (event) => {
      if (!drag) return;
      drag.distance = Math.max(0, event.clientY - drag.startY);
      dialog.style.setProperty("--sheet-drag", `${drag.distance}px`);
    });
    const release = (event) => {
      if (!drag) return;
      const { distance, startTime } = drag;
      drag = null;
      dialog.style.removeProperty("--sheet-drag");
      const outcome = dragOutcome({ distance, height: dialog.offsetHeight, speed: distance / Math.max(1, event.timeStamp - startTime) });
      if (outcome === "close") closeSheet(dialog);
    };
    grabber.addEventListener("pointerup", release);
    grabber.addEventListener("pointercancel", release);
  }

  function openSheet(dialog, { opener = document.activeElement, dismissible = true, onClose = () => {} } = {}) {
    for (const other of [...open.keys()]) if (other !== dialog) finish(other, false);
    wire(dialog);
    open.set(dialog, { opener, dismissible, onClose });
    dialog.setAttribute("aria-modal", "true");
    if (!dialog.open) dialog.showModal();
  }

  return { openSheet, closeSheet, isOpen: (dialog) => open.has(dialog) };
}

const sheets = typeof document !== "undefined" ? makeSheets({ document, history: window.history }) : null;

if (typeof module !== "undefined") module.exports = { dragOutcome, makeSheets };
