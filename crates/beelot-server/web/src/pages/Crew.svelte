<script lang="ts">
  // Crew (US-070, US-124): create a private table, join or watch one with its code, the friends of a signed-in player, the
  // online tables this tab still holds a seat at, and the friend link that opens /friends/add/{code}.
  import { ArrowRight, Check, Copy, Eye, Globe, Link2, Plus, UserMinus, UserPlus, X } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { api, apiJson, setPrivateSession, tableRequest, tableTokens, type ApiError } from "$lib/api/client";
  import { t } from "$lib/i18n/i18n.svelte";
  import { friendLinkUrl, linkMessage, openTables, sortFriends, type OpenTable } from "$lib/models/small";
  import { account, defaultPlayerName } from "$lib/stores/account.svelte";
  import { friendAction, friends, loadFriends } from "$lib/stores/friends.svelte";
  import { navigate, route } from "$lib/stores/router.svelte";
  import { notices } from "$lib/stores/notices.svelte";
  import Button from "$lib/ui/Button.svelte";
  import CodeBoxes from "$lib/ui/CodeBoxes.svelte";
  import { keepInView } from "$lib/ui/keepInView";

  let { message = $bindable(""), friendCode }: { message?: string; friendCode?: string } = $props();
  let name = $state(defaultPlayerName());
  let code = $state("");
  let busy = $state(false);
  let open = $state<OpenTable[]>([]);
  let copied = $state(false);

  $effect(() => {
    if (account.name && (name === "" || name === t("Player"))) name = account.name;
  });

  function enter(access: { tableId: string; playerToken: string }) {
    setPrivateSession(access);
    navigate(`/online/private/table/${access.tableId}`);
  }

  async function join(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    message = "";
    try {
      enter(await api.join(code, name));
    } catch (error) {
      message = (error as Error).message;
    } finally {
      busy = false;
    }
  }

  async function watch() {
    message = "";
    try {
      enter(await api.watch(code));
    } catch (error) {
      message = (error as Error).message;
    }
  }

  async function addFriend(link: string) {
    let text: string;
    try {
      const { text: key, values } = linkMessage(await apiJson("/api/friends/link", tableRequest("POST", { code: link })));
      text = t(key, ...values);
    } catch (error) {
      text = (error as ApiError).status === 401 ? t("Sign in to add friends, then open the link again.") : (error as Error).message;
    }
    navigate("/online/private", { replace: true });
    message = text;
    loadFriends();
  }

  async function copyLink() {
    if (!friends.data) return;
    try {
      await navigator.clipboard.writeText(friendLinkUrl(location.origin, friends.data.code));
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* the link stays visible to copy by hand */
    }
  }

  onMount(async () => {
    message = notices.take("/online/private") || message;
    if (friendCode) addFriend(friendCode);
    const snapshots = await Promise.all(Object.keys(tableTokens()).map((id) => api.table(id).catch(() => null)));
    if (route().view === "private") open = openTables(snapshots);
  });
</script>

<div class="page crew">
  <header class="head">
    <p class="eyebrow">{t("Friends, rivals, legends")}</p>
    <h1 class="page-title">{t("Bring the crew.")}</h1>
    <p class="lead">{t("Make a room in seconds or use a six-character invite to jump into the fun.")}</p>
  </header>

  <div class="grid">
    <section class="card create glass">
      <span class="badge"><Plus size={22} aria-hidden="true" /></span>
      <h2>{t("Create a table")}</h2>
      <p>{t("You get a code to share. Friends join in one tap; bots can fill the empty seats.")}</p>
      <Button href="/online/private/new" size="lg" block>{t("Create a private table")} <ArrowRight size={18} aria-hidden="true" /></Button>
    </section>

    <form class="card glass" onsubmit={join} use:keepInView>
      <h2>{t("Join friends")}</h2>
      <label>
        <span class="label">{t("Your name")}</span>
        <input class="field" autocomplete="name" maxlength="30" name="playerName" required bind:value={name} />
      </label>
      <span class="label" id="invitation-code-label">{t("Invitation code")}</span>
      <CodeBoxes bind:value={code} labelledby="invitation-code-label" />
      <div class="actions">
        <Button type="submit" {busy}>{t("Join table")}</Button>
        <Button variant="secondary" onclick={watch}><Eye size={18} aria-hidden="true" />{t("Watch this table")}</Button>
      </div>
    </form>
  </div>

  <p class="message" role="alert">{message}</p>

  {#if open.length}
    <section class="card glass" aria-labelledby="crew-open-title" in:fly={{ y: 12, duration: 300 }}>
      <h2 id="crew-open-title">{t("Your open tables")}</h2>
      <ul class="list">
        {#each open as table (table.id)}
          <li><a class="row-link" href={table.path}><span>{t("{0} · {1}", t(table.variantLabel), t(table.waiting ? "Waiting" : "Resume"))}</span><ArrowRight size={18} aria-hidden="true" /></a></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if friends.data}
    {@const data = friends.data}
    <section class="card glass friends">
      <h2>{t("Friends")}</h2>
      <div class="link-row">
        <label class="grow">
          <span class="label"><Link2 size={14} aria-hidden="true" /> {t("Your friend link")}</span>
          <input class="field" readonly value={friendLinkUrl(location.origin, data.code)} onfocus={(event) => (event.currentTarget as HTMLInputElement).select()} />
        </label>
        <Button variant="secondary" onclick={copyLink}>{#if copied}<Check size={18} aria-hidden="true" />{t("Copied")}{:else}<Copy size={18} aria-hidden="true" />{t("Copy")}{/if}</Button>
      </div>
      {#if data.requests.length}
        <h3>{t("Friend requests")}</h3>
        <ul class="list">
          {#each data.requests as person (person.id)}
            <li class="friend">
              <span class="who"><UserPlus size={18} aria-hidden="true" />{person.name}</span>
              <span class="buttons">
                <Button size="sm" onclick={() => friendAction("POST", `/api/friends/${person.id}/accept`)}>{t("Accept")}</Button>
                <Button size="sm" variant="secondary" onclick={() => friendAction("DELETE", `/api/friends/${person.id}`)}><X size={16} aria-hidden="true" />{t("Decline")}</Button>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if data.friends.length}
        <ul class="list">
          {#each sortFriends(data.friends) as friend (friend.id)}
            <li class="friend">
              <span class="who"><span class="dot" class:online={friend.online} aria-hidden="true"></span>{friend.name}<small>{friend.online === undefined ? "" : t(friend.online ? "Online" : "Offline")}</small></span>
              <Button size="sm" variant="ghost" onclick={() => friendAction("DELETE", `/api/friends/${friend.id}`)}><UserMinus size={16} aria-hidden="true" />{t("Remove")}</Button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">{t("No friends yet. Share your link: when someone opens it and you accept, you are friends.")}</p>
      {/if}
    </section>
  {/if}

  <a class="public-link glass" href="/online/public">
    <span class="badge violet"><Globe size={22} aria-hidden="true" /></span>
    <span><strong>{t("Find a game")}</strong><small>{t("Join an open table — bots fill in if nobody shows up.")}</small></span>
    <ArrowRight size={20} aria-hidden="true" />
  </a>
</div>

<style>
  .crew {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.25rem;
  }
  .head {
    display: grid;
    gap: 0.6rem;
  }
  .lead {
    color: var(--color-muted);
    max-width: 34rem;
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
  }
  @media (min-width: 900px) {
    .grid {
      grid-template-columns: 1fr 1.2fr;
    }
  }
  .card {
    display: grid;
    gap: 0.9rem;
    align-content: start;
    padding: 1.25rem;
    border-radius: 1.5rem;
  }
  .card h2 {
    font-size: 1.3rem;
    font-weight: 700;
  }
  .card h3 {
    font-size: 1rem;
    color: var(--color-muted);
  }
  .create p,
  .muted {
    color: var(--color-muted);
    font-size: 0.92rem;
  }
  .create {
    background: linear-gradient(150deg, rgb(255 194 46 / 0.16), rgb(255 255 255 / 0.03));
  }
  .badge {
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    border-radius: 1rem;
    color: #1b1203;
    background: linear-gradient(140deg, var(--color-honey-300), var(--color-honey-600));
  }
  .badge.violet {
    color: #fff;
    background: linear-gradient(140deg, var(--color-violet-300), var(--color-violet-600));
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .list {
    display: grid;
    gap: 0.4rem;
    list-style: none;
    padding: 0;
  }
  .row-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.8rem 1rem;
    border-radius: 1rem;
    background: rgb(255 255 255 / 0.05);
    color: var(--color-ink);
    text-decoration: none;
    font-weight: 600;
  }
  .link-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .label :global(svg) {
    display: inline;
    vertical-align: -2px;
  }
  .friend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.55rem 0.4rem 0.55rem 0.9rem;
    border-radius: 1rem;
    background: rgb(255 255 255 / 0.04);
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    font-weight: 600;
    min-width: 0;
  }
  .who small {
    color: var(--color-faint);
    font-weight: 500;
  }
  .buttons {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--color-faint);
  }
  .dot.online {
    background: var(--color-mint-400);
    box-shadow: 0 0 0 3px rgb(79 240 189 / 0.2);
  }
  .public-link {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.1rem;
    border-radius: 1.4rem;
    color: var(--color-ink);
    text-decoration: none;
  }
  .public-link span:nth-child(2) {
    display: grid;
    flex: 1;
  }
  .public-link small {
    color: var(--color-muted);
  }
</style>
