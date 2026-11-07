// Friends and invitations (US-070): what the Crew page and the banner say. No DOM.

// The personal link a player shares.
function friendLinkUrl(origin, code) {
  return `${origin}/friends/add/${code}`;
}

// Friends who are online first, each group by name as the server gave them.
function sortFriends(friends) {
  return [...friends.filter((friend) => friend.online), ...friends.filter((friend) => !friend.online)];
}

// The invitations the player has not been shown yet; `seen` holds the ids already shown.
function newInvites(invites, seen) {
  return invites.filter((invite) => !seen.has(invite.id));
}

// What opening a friend link led to: the server's status for the person's name.
function linkMessage(result) {
  return result.status === "friends"
    ? { text: "You and {0} are friends now.", values: [result.name] }
    : { text: "Friend request sent to {0}. They need to accept it.", values: [result.name] };
}

if (typeof module !== "undefined") module.exports = { friendLinkUrl, sortFriends, newInvites, linkMessage };
