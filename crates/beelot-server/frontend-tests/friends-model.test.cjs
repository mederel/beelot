const test = require("node:test");
const assert = require("node:assert/strict");
const { friendLinkUrl, sortFriends, newInvites, linkMessage } = require("../static/friends-model.js");

test("the friend link points to the add route", () => {
  assert.equal(friendLinkUrl("https://beelot.example", "abc"), "https://beelot.example/friends/add/abc");
});

test("online friends come first and keep their order", () => {
  const friends = [{ name: "A", online: false }, { name: "B", online: true }, { name: "C", online: false }, { name: "D", online: true }];
  assert.deepEqual(sortFriends(friends).map((friend) => friend.name), ["B", "D", "A", "C"]);
});

test("an invitation is new until its id was seen", () => {
  const invites = [{ id: 3 }, { id: 2 }];
  assert.deepEqual(newInvites(invites, new Set([2])), [{ id: 3 }]);
  assert.deepEqual(newInvites(invites, new Set([2, 3])), []);
});

test("a request waits for acceptance and a mutual one makes friends", () => {
  assert.match(linkMessage({ status: "requested", name: "Ana" }).text, /Friend request sent/);
  assert.deepEqual(linkMessage({ status: "friends", name: "Ana" }), { text: "You and {0} are friends now.", values: ["Ana"] });
});
