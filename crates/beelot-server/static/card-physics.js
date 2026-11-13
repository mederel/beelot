// The numbers behind the physical card play (US-089): how the hand fans out, the angle a played card
// rests at, the flight of a card from its origin to its slot, and which sentence explains an illegal
// card. Pure, so it is tested in Node; app.js applies the results as CSS custom properties.

const FAN_STEP_DEGREES = 4;
const FAN_SPAN_DEGREES = 28;
const FAN_DROP_PX = 0.9;
const REST_ANGLE_DEGREES = 3;

const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

// The resting pose of card `index` of `count` in the hand: a rotation in degrees and a drop in px.
// The angle grows by 4 degrees per card from the centre, capped so the hand spans at most +/-14.
function fanFor(index, count) {
  const fromCentre = index - (count - 1) / 2;
  const step = count > 1 ? Math.min(FAN_STEP_DEGREES, FAN_SPAN_DEGREES / (count - 1)) : 0;
  return { rotation: fromCentre * step + 0, offsetY: round(FAN_DROP_PX * fromCentre ** 2) };
}

// A stable angle in [-3, 3] degrees for a card, so a played card rests the same way after a redraw.
function restAngle(card) {
  let hash = 0x811c9dc5;
  for (const character of `${card.rank}-${card.suit}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0;
  }
  return round((hash % 61) / 10 - REST_ANGLE_DEGREES);
}

// The offset that puts a card at `origin`'s centre when it sits in `slot`; boxes are
// `{ left, top, width, height }`, as getBoundingClientRect gives.
function flightVector(origin, slot) {
  const centre = (box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  const from = centre(origin);
  const to = centre(slot);
  return { x: from.x - to.x, y: from.y - to.y };
}

// The sentence (an English key for `t()`) and the suit to show for an `illegalCards` entry. `trump` is
// the board's trump as the server names it ("All trumps" for the all-trumps variant).
function reasonText(entry, trump) {
  if (entry.reason === "MUST_FOLLOW") return { key: "Follow the suit led: {0}", suit: entry.suit };
  if (entry.reason === "MUST_TRUMP") return { key: "You must trump.", suit: null };
  const allTrumps = trump === "All trumps" || trump === "ALL_TRUMPS";
  return { key: allTrumps ? "Play a higher card." : "Play a higher trump.", suit: null };
}

// How a hand of `count` cards is laid out on a portrait phone (US-108): one row up to five cards, otherwise two balanced rows.
function handLayout(count) {
  return count <= 5 ? { cols: Math.max(1, count), rows: 1 } : { cols: Math.ceil(count / 2), rows: 2 };
}

// The order a hand is shown in while a deal arrives (US-140): the cards already held stay where they are, and the new
// ones follow in the order the deal gave them. The taker's upturned card is the first new card in the server's order
// but arrives last, after their packet, so it moves to the end. Cards are keys such as "J-HEARTS".
function arrivalOrder(heldKeys, dealtKeys, upturnedLast = false) {
  const held = new Set(heldKeys);
  const arriving = dealtKeys.filter((key) => !held.has(key));
  if (upturnedLast && arriving.length > 1) arriving.push(arriving.shift());
  return [...heldKeys, ...arriving];
}

if (typeof module !== "undefined") module.exports = { fanFor, restAngle, flightVector, reasonText, handLayout, arrivalOrder };
