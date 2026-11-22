// Friends (US-070): the Crew page's list, the invitations that arrive while the app is open, and the invite buttons of a
// table's lobby. Signed-in players only; the list is asked for again every twenty seconds.
import { apiJson, tableRequest } from "$lib/api/client";
import { sfx } from "$lib/audio/sfx";
import { newInvites, type Friend } from "$lib/models/small";

const FRIENDS_POLL_MS = 20000;

export interface Invite {
  id: string;
  from: string;
  code: string;
}

export const friends = $state({
  data: null as null | { code: string; friends: Friend[]; requests: Friend[]; invites: Invite[] },
  invite: null as Invite | null
});

let timer: number | null = null;
const seen = new Set<string>();

export async function loadFriends(): Promise<void> {
  try {
    const data = await apiJson("/api/friends");
    friends.data = Array.isArray(data?.friends) && Array.isArray(data.requests) && Array.isArray(data.invites) ? data : null;
  } catch {
    friends.data = null;
  }
  if (!friends.data) return;
  const fresh = newInvites(friends.data.invites, seen);
  fresh.forEach((invite) => seen.add(invite.id));
  if (fresh.length) {
    friends.invite = fresh[0];
    sfx.play("invite");
  }
}

export function startFriendsPolling(signedIn: boolean): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  if (!signedIn) {
    friends.data = null;
    return;
  }
  loadFriends();
  timer = window.setInterval(loadFriends, FRIENDS_POLL_MS);
}

export async function friendAction(method: string, url: string): Promise<void> {
  await apiJson(url, { method });
  await loadFriends();
}

export function dismissInvite(invite: Invite): void {
  friends.invite = null;
  apiJson(`/api/invites/${invite.id}`, { method: "DELETE" }).catch(() => {});
}

export async function inviteFriend(tableId: string, friendId: string): Promise<void> {
  await apiJson(`/api/tables/${tableId}/invite`, tableRequest("POST", { friendId }, tableId));
}
