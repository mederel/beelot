// Friends (US-070): the Crew page's list, the invitations that arrive while the app is open, and the invite buttons of
// a table's lobby. Signed-in players only; the list is asked for again every twenty seconds.
const FRIENDS_POLL_MS = 20000;
let friendsData = null;
let friendsTimer = null;
const seenInvites = new Set();

function friendRow(friend, buttons) {
  const row = document.createElement("li");
  row.className = "friend-row";
  const name = document.createElement("span");
  name.textContent = friend.name;
  const state = document.createElement("small");
  state.textContent = friend.online === undefined ? "" : t(friend.online ? "Online" : "Offline");
  row.append(name, state, ...buttons);
  return row;
}

function friendButton(label, onClick, secondary = true) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = secondary ? "button secondary-button" : "button";
  button.textContent = t(label);
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await onClick(button);
    } catch (_) {
      button.disabled = false;
    }
  });
  return button;
}

async function friendAction(method, url) {
  await apiJson(url, { method });
  await loadFriends();
}

function renderFriends() {
  const panel = document.querySelector("#friends-panel");
  panel.hidden = !friendsData;
  if (!friendsData) return;
  document.querySelector("#friend-link").value = friendLinkUrl(window.location.origin, friendsData.code);
  const requests = document.querySelector("#friend-requests");
  requests.replaceChildren(...friendsData.requests.map((person) => friendRow(person, [
    friendButton("Accept", () => friendAction("POST", `/api/friends/${person.id}/accept`), false),
    friendButton("Decline", () => friendAction("DELETE", `/api/friends/${person.id}`))
  ])));
  requests.hidden = friendsData.requests.length === 0;
  document.querySelector("#friend-requests-title").hidden = requests.hidden;
  const list = document.querySelector("#friend-list");
  list.replaceChildren(...sortFriends(friendsData.friends).map((friend) => friendRow(friend, [
    friendButton("Remove", () => friendAction("DELETE", `/api/friends/${friend.id}`))
  ])));
  document.querySelector("#friend-empty").hidden = friendsData.friends.length > 0;
}

// An invitation arrives as a banner with a one-click join: it takes the table's code and the player's own name.
function renderInvite(invite) {
  const banner = document.querySelector("#invite-banner");
  document.querySelector("#invite-text").textContent = t("{0} invites you to a table.", invite.from);
  document.querySelector("#invite-join").onclick = async () => {
    banner.hidden = true;
    try {
      enterPrivateTable(await api.join(invite.code, accountName ?? t("Player")));
      apiJson(`/api/invites/${invite.id}`, { method: "DELETE" }).catch(() => {});
    } catch (error) {
      document.querySelector("#private-form-message").textContent = error.message;
    }
  };
  document.querySelector("#invite-dismiss").onclick = () => {
    banner.hidden = true;
    apiJson(`/api/invites/${invite.id}`, { method: "DELETE" }).catch(() => {});
  };
  banner.hidden = false;
}

async function loadFriends() {
  try {
    const data = await apiJson("/api/friends");
    friendsData = Array.isArray(data?.friends) && Array.isArray(data.requests) && Array.isArray(data.invites) ? data : null;
  } catch (_) {
    friendsData = null;
  }
  renderFriends();
  renderLobbyFriends();
  if (!friendsData) return;
  const fresh = newInvites(friendsData.invites, seenInvites);
  fresh.forEach((invite) => seenInvites.add(invite.id));
  if (fresh.length) renderInvite(fresh[0]);
}

function startFriendsPolling(signedIn) {
  window.clearInterval(friendsTimer);
  friendsTimer = null;
  if (!signedIn) {
    friendsData = null;
    renderFriends();
    return;
  }
  loadFriends();
  friendsTimer = window.setInterval(loadFriends, FRIENDS_POLL_MS);
}

// The owner of a waiting private table sees their online friends, each with an invite button.
let lobbyInviteTable = null;

function showLobbyFriends(owner, tableId) {
  lobbyInviteTable = owner ? tableId : null;
  renderLobbyFriends();
}

function renderLobbyFriends() {
  const section = document.querySelector("#lobby-friends");
  const online = friendsData && lobbyInviteTable ? friendsData.friends.filter((friend) => friend.online) : [];
  section.hidden = online.length === 0;
  document.querySelector("#lobby-friend-list").replaceChildren(...online.map((friend) => friendRow({ name: friend.name }, [
    friendButton("Invite", async (button) => {
      await apiJson(`/api/tables/${lobbyInviteTable}/invite`, jsonRequest("POST", { friendId: friend.id }, lobbyInviteTable));
      button.textContent = t("Invited");
    }, false)
  ])));
}

// Opening someone's friend link asks them to be friends (`/friends/add/{code}`), then leads back to Crew.
async function addFriendFromLink(code) {
  let message;
  try {
    const { text, values } = linkMessage(await apiJson("/api/friends/link", jsonRequest("POST", { code })));
    message = t(text, ...values);
  } catch (error) {
    message = error.status === 401 ? t("Sign in to add friends, then open the link again.") : error.message;
  }
  navigate("/online/private", { replace: true });
  document.querySelector("#private-form-message").textContent = message;
  loadFriends();
}

document.querySelector("#friend-link-copy").addEventListener("click", async () => {
  const input = document.querySelector("#friend-link");
  try {
    await navigator.clipboard.writeText(input.value);
  } catch (_) {
    input.select();
  }
});
