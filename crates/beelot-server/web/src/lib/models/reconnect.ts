// The rules of the reconnect button and of the missed-moves line (US-163). It touches no DOM: the timers and the views are given
// by app-core.js, which makes the tracker of one table stream's gaps.

// How long the live link of a table has to be down before the "Reconnect now" button shows, and how long the line that says
// how many moves were missed stays on screen.
export const NOTE_DELAY_MS = 3000;
export const BUTTON_DELAY_MS = 10000;
export const MISSED_LINE_MS = 5000;

// The moves made while the link was down: the rise of the table's `moves` counter, which counts the calls and the cards (the
// bots' included) and not a change of presence or a reaction. Zero when either number is missing (a server without the counter)
// or the table did not move forward.
export function missedMoves(before: any, after: any) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 0;
  return Math.max(0, after - before);
}

// The translation key of the line and its count, or null when nothing was missed. The caller translates the key and puts `n`
// where `{n}` stands.
export function missedLine(count: any) {
  if (!Number.isInteger(count) || count < 1) return null;
  return count === 1 ? { key: "You missed 1 move", n: 1 } : { key: "You missed {n} moves", n: count };
}

// The gaps of a table's event stream. `failed()` is called at every error of the stream, `opened()` when it is open again,
// `cleared()` when the player leaves or the server refuses it. The note (US-142) shows after NOTE_DELAY_MS of a gap and the
// button after BUTTON_DELAY_MS; `opened()` hands back a ticket for a gap that showed the note (else null), and `announce` turns
// it and the moves counter read after the gap into the line. `view` has note(on), button(visible, disabled) and line(line | null).
export function makeGapTracker({ setTimer, clearTimer, movesOf, view }: any) {
  let noteTimer: any = null;
  let buttonTimer: any = null;
  let lineTimer: any = null;
  let active = false;
  let dropped = false;
  let buttonShown = false;
  let before: number | undefined;
  let generation = 0;

  function stopTimers() {
    for (const timer of [noteTimer, buttonTimer]) if (timer !== null) clearTimer(timer);
    noteTimer = null;
    buttonTimer = null;
  }

  function hideGap() {
    stopTimers();
    if (dropped) {
      view.note(false);
      view.button(false, false);
    }
    active = false;
    dropped = false;
    buttonShown = false;
  }

  function hideLine() {
    if (lineTimer === null) return;
    clearTimer(lineTimer);
    lineTimer = null;
    view.line(null);
  }

  return {
    failed() {
      if (active) {
        if (buttonShown) view.button(true, false);
        return;
      }
      active = true;
      before = movesOf();
      // A line still owed to the gap that just ended is dropped: its read may land during this new gap.
      generation += 1;
      hideLine();
      noteTimer = setTimer(() => {
        noteTimer = null;
        dropped = true;
        view.note(true);
      }, NOTE_DELAY_MS);
      buttonTimer = setTimer(() => {
        buttonTimer = null;
        buttonShown = true;
        view.button(true, false);
      }, BUTTON_DELAY_MS);
    },
    // The note is up: an answer to an ordinary request does not hide it (US-142).
    isDropped() {
      return dropped;
    },
    reconnectRequested() {
      if (buttonShown) view.button(true, true);
    },
    opened() {
      const ticket = dropped ? { generation, before } : null;
      hideGap();
      return ticket;
    },
    announce(ticket: { generation: number; before: number | undefined } | null, after: number | undefined) {
      if (!ticket || ticket.generation !== generation) return;
      const line = missedLine(missedMoves(ticket.before as number, after as number));
      if (!line) return;
      view.line(line);
      lineTimer = setTimer(() => {
        lineTimer = null;
        view.line(null);
      }, MISSED_LINE_MS);
    },
    cleared() {
      generation += 1;
      hideGap();
      hideLine();
    }
  };
}
