const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("./app-source.cjs").appSource();

test("the opening deal shows the cards in the order the pile gave them, in both table views", () => {
  const shown = app.match(/animateDeal \? bidding\.dealt \?\? bidding\.hand : orderHandForDisplay\(bidding\.hand\)/g) || [];
  assert.equal(shown.length, 2);
});

test("the opening deal sorts the hand when the cards have all arrived", () => {
  const opening = app.slice(app.indexOf("async function playOpeningDeal"), app.indexOf("async function loadBidding"));
  assert.match(opening, /sortedKeys: orderHandForDisplay\(bidding\.hand\)/);
});

test("dealCards sorts the human's hand with a slide once the last packet landed, before leaving the dealing state", () => {
  const deal = app.slice(app.indexOf("async function dealCards"), app.indexOf("function sortHandAnimated"));
  assert.ok(deal.indexOf("await sortHandAnimated(handElement, sortedKeys, restyle)") > deal.indexOf("for (const step of steps)"));
  assert.ok(deal.indexOf("await sortHandAnimated") < deal.indexOf('handElement.classList.remove("dealing")'));
});

test("the sort slides each card from where it was (FLIP) and skips the slide with reduced motion", () => {
  const sort = app.slice(app.indexOf("function sortHandAnimated"), app.indexOf("function sortHandAnimated") + 1600);
  assert.match(sort, /getBoundingClientRect/);
  assert.match(sort, /card\.animate\(/);
  assert.ok(sort.indexOf("motionReduced()") < sort.indexOf("card.animate("));
});

test("the second deal puts the new cards after the held ones, then sorts with the fan restyled", () => {
  const second = app.slice(app.indexOf("async function playSecondDeal"), app.indexOf("async function playCard"));
  assert.match(second, /arrivalOrder\(heldKeys, \(board\.dealt \?\? board\.hand\)\.map\(keyOf\), takesUpturned\)/);
  assert.match(second, /sortedKeys: orderHandForDisplay\(board\.hand, board\.trump\)/);
  assert.match(second, /restyle: placeInFan/);
});

test("the deal is not animated, so the hand is sorted at once, with reduced motion or a restored table", () => {
  assert.match(app, /const animateDeal = !online && dealKey !== lastDealKey && !motionReduced\(\)/);
  assert.match(app, /&& !motionReduced\(\) \? pendingSecondDeal : null/);
});
