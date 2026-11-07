// The six-box invitation code (US-124): pure helpers; the DOM wiring is in app.js.
const CODE_LENGTH = 6;

function normalizeCode(text) {
  return String(text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

// The text of each box for a typed or pasted value, from the box at `start`.
function spreadCode(current, start, text) {
  const boxes = Array.from({ length: CODE_LENGTH }, (_, index) => current[index] ?? "");
  const characters = normalizeCode(text).slice(0, CODE_LENGTH - start);
  characters.split("").forEach((character, offset) => { boxes[start + offset] = character; });
  return boxes;
}

// Which box takes the focus after typing into `index` (the one after a filled box, or the last box) ...
function boxAfterInput(index, boxes) {
  const filled = boxes[index] !== "";
  return filled ? Math.min(index + 1, CODE_LENGTH - 1) : index;
}

// ... and after Backspace in an empty box (the one before).
function boxAfterBackspace(index, boxes) {
  return boxes[index] === "" ? Math.max(index - 1, 0) : index;
}

const joinedCode = (boxes) => boxes.join("");

if (typeof module !== "undefined") module.exports = { CODE_LENGTH, normalizeCode, spreadCode, boxAfterInput, boxAfterBackspace, joinedCode };
