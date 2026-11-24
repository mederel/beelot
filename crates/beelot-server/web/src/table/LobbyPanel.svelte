<script lang="ts">
  // The online lobby (US-121): the invitation code to copy or share, the seats (sit in an empty one), the owner's friends to
  // invite (US-070), the table's rules for the owner (timer, announcements, spectators, tout-atout, target), the summary,
  // and ready, start, start with bots, or leave a public table while it looks for players.
  import { Check, Copy, Share2, UserPlus, Bot, Wifi, WifiOff } from "@lucide/svelte";
  import { fly } from "svelte/transition";
  import { formatNumber, playerName, t } from "$lib/i18n/i18n.svelte";
  import { friends, inviteFriend } from "$lib/stores/friends.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Segmented from "$lib/ui/Segmented.svelte";
  import Avatar from "$lib/avatars/Avatar.svelte";
  import type { TableGame } from "./game.svelte";

  let { game }: { game: TableGame } = $props();
  const lobby = $derived(game.lobby!);
  const model = $derived(lobby.model);
  let copied = $state(false);
  let invited = $state<string[]>([]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(model.code);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* the code stays visible to copy by hand */
    }
  }

  async function share() {
    try {
      await navigator.share({ text: t("Join my Beelot table: code {0}", model.code) });
    } catch {
      /* cancelled */
    }
  }

  async function invite(friendId: string) {
    try {
      await inviteFriend(lobby.table.id, friendId);
      invited = [...invited, friendId];
    } catch {
      /* the button stays */
    }
  }

  const onlineFriends = $derived(model.rules.shown && friends.data ? friends.data.friends.filter((friend) => friend.online) : []);
  const summary = $derived.by(() => {
    const parts = [`${t("Variant: {0}", t(lobby.table.variantLabel))}.`];
    parts.push(model.summary.timer ? t("Turn timer: {0} seconds. A warning appears with 10 seconds remaining; an expired turn is played by a bot.", model.summary.timer) : t("Turn timer is disabled."));
    parts.push(t(model.summary.announcements ? "Announcements are on." : "Announcements are off."));
    if (model.summary.allTrumps !== null) parts.push(t(model.summary.allTrumps ? "Tout-atout and sans-atout are played." : "Only the four suits are played."));
    if (model.summary.spectators) parts.push(t("Spectators are allowed."));
    parts.push(t("The match is played to {0} points.", formatNumber(model.summary.target)));
    return parts.join(" ");
  });
  const onOff = $derived([
    { value: "on", label: t("On") },
    { value: "off", label: t("Off") }
  ]);
</script>

<section class="lobby glass" aria-labelledby="lobby-title" transition:fly={{ y: settings.effects === "full" ? 200 : 0, duration: 380, opacity: 0 }}>
  <h2 id="lobby-title">{t(model.title)}</h2>

  {#if model.showCode}
    <div class="code-row">
      <span class="label">{t("Invitation code")}</span>
      <strong class="code" aria-label={model.code.split("").join(" ")}>{#each model.code.split("") as letter, index (index)}<span>{letter}</span>{/each}</strong>
      <div class="code-actions">
        <Button size="sm" variant="secondary" onclick={copy}>{#if copied}<Check size={16} aria-hidden="true" />{t("Copied")}{:else}<Copy size={16} aria-hidden="true" />{t("Copy")}{/if}</Button>
        {#if typeof navigator !== "undefined" && "share" in navigator}
          <Button size="sm" variant="secondary" onclick={share}><Share2 size={16} aria-hidden="true" />{t("Share")}</Button>
        {/if}
      </div>
    </div>
  {/if}

  <div class="seats" aria-label={t("Seats")}>
    {#each model.seats as seat (seat.position)}
      <div class="seat" class:empty={seat.empty} class:you={seat.you} data-team={seat.position % 2}>
        <small class="team">{t(seat.team)}</small>
        {#if seat.empty}
          <span class="placeholder" aria-hidden="true">?</span>
          <strong>{t("Empty seat")}</strong>
          {#if seat.canSit}
            <button class="sit" type="button" aria-label={t("Sit in this {0} seat", t(seat.team))} onclick={() => game.onlineAction({ type: "seat", position: seat.position })}>{t("Sit here")}</button>
          {/if}
        {:else}
          <Avatar name={seat.name} team={seat.position % 2} size="2.4rem" expression={seat.ready ? "pleased" : "neutral"} />
          <strong>{seat.you ? t("{0} (you)", playerName(seat.name)) : playerName(seat.name)}</strong>
          <span class="state" class:ready={seat.ready || seat.type === "BOT"}>
            {#if seat.type === "BOT"}<Bot size={12} aria-hidden="true" />{t("Ready")}{:else}
              {#if seat.connection === "connected"}<Wifi size={12} aria-hidden="true" />{:else}<WifiOff size={12} aria-hidden="true" />{/if}
              {t(seat.ready ? "Ready" : "Waiting")} · {t(seat.connection === "bot" ? "Bot takeover" : seat.connection === "disconnected" ? "Disconnected" : "Connected")}
            {/if}
          </span>
        {/if}
      </div>
    {/each}
  </div>

  {#if model.publicWaiting}<p class="wait" role="status">{lobby.countdown}</p>{/if}

  {#if onlineFriends.length}
    <div class="friends">
      <h3>{t("Invite friends")}</h3>
      <ul>
        {#each onlineFriends as friend (friend.id)}
          <li>
            <span>{friend.name}</span>
            <Button size="sm" disabled={invited.includes(friend.id)} onclick={() => invite(friend.id)}><UserPlus size={14} aria-hidden="true" />{t(invited.includes(friend.id) ? "Invited" : "Invite")}</Button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if model.rules.shown}
    <details class="rules">
      <summary>{t("Table rules")}</summary>
      <div class="rules-body">
        <Segmented name="lobby-timer" label={t("Turn timer")} size="sm" value={String(model.rules.timer)} onchange={(value) => game.onlineAction({ type: "settings", turnTimer: Number(value) })} options={[{ value: "0", label: t("No timer") }, { value: "30", label: t("30 seconds") }, { value: "60", label: t("60 seconds") }]} />
        <Segmented name="lobby-announcements" label={t("Announcements")} size="sm" value={model.rules.announcements ? "on" : "off"} onchange={(value) => game.onlineAction({ type: "settings", announcements: value === "on" })} options={onOff} />
        <Segmented name="lobby-spectators" label={t("Spectators")} size="sm" value={model.rules.spectators ? "on" : "off"} onchange={(value) => game.onlineAction({ type: "spectators", allowed: value === "on" })} options={[{ value: "off", label: t("Not allowed") }, { value: "on", label: t("Allowed") }]} />
        {#if model.rules.allTrumps !== null}
          <Segmented name="lobby-all-trumps" label={t("Tout-atout and sans-atout")} size="sm" value={model.rules.allTrumps ? "on" : "off"} onchange={(value) => game.onlineAction({ type: "settings", allTrumps: value === "on" })} options={onOff} />
        {/if}
        <Segmented name="lobby-target" label={t("Match target")} size="sm" value={String(model.rules.target)} onchange={(value) => game.onlineAction({ type: "settings", target: Number(value) })} options={[500, 1000, 1500, 2000].map((target) => ({ value: String(target), label: t("{0} points", formatNumber(target)) }))} />
      </div>
    </details>
  {/if}

  <p class="summary">{summary}</p>
  <p class="message" role="alert">{lobby.message}</p>

  <div class="actions">
    {#if model.ready.shown && !lobby.table.publicTable}
      <Button variant={model.ready.on ? "secondary" : "primary"} onclick={() => game.onlineAction({ type: "ready", ready: !model.ready.on })}>{t(model.ready.on ? "Not ready" : "I am ready")}</Button>
    {/if}
    {#if model.start.shown}
      <Button disabled={model.start.disabled} onclick={() => game.onlineAction({ type: "start", fillWithBots: false })}>{t("Start game")}</Button>
    {/if}
    {#if model.startWithBots.shown}
      <Button variant="secondary" disabled={model.startWithBots.disabled} onclick={() => game.onlineAction({ type: "start", fillWithBots: true })}><Bot size={16} aria-hidden="true" />{t("Start now with bots")}</Button>
    {/if}
    {#if model.publicWaiting}
      <Button variant="secondary" onclick={() => game.leavePublic()}>{t("Leave table")}</Button>
    {/if}
  </div>
</section>

<style>
  .lobby {
    position: absolute;
    z-index: 20;
    left: 0.5rem;
    right: 0.5rem;
    bottom: max(0.5rem, env(safe-area-inset-bottom));
    max-height: calc(100% - 7rem);
    overflow-y: auto;
    display: grid;
    gap: 0.9rem;
    padding: 1.1rem;
    border-radius: 1.6rem;
    background: linear-gradient(180deg, rgb(32 28 66 / 0.95), rgb(17 15 36 / 0.97));
  }
  @media (min-width: 720px) {
    .lobby {
      left: 50%;
      right: auto;
      translate: -50% 0;
      width: min(36rem, calc(100% - 2rem));
      bottom: 1.5rem;
    }
  }
  h2 {
    font-size: 1.6rem;
    font-weight: 800;
  }
  h3 {
    font-size: 0.95rem;
    color: var(--color-muted);
    margin-bottom: 0.4rem;
  }
  .code-row {
    display: grid;
    gap: 0.5rem;
    justify-items: start;
  }
  .code {
    display: flex;
    gap: 0.3rem;
  }
  .code span {
    display: grid;
    place-items: center;
    width: 2.4rem;
    height: 2.9rem;
    border-radius: 0.7rem;
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--color-honey-200);
    background: rgb(255 194 46 / 0.1);
    border: 1px solid rgb(255 194 46 / 0.3);
  }
  .code-actions {
    display: flex;
    gap: 0.4rem;
  }
  .seats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .seat {
    display: grid;
    justify-items: center;
    gap: 0.25rem;
    padding: 0.7rem 0.5rem;
    border-radius: 1.1rem;
    text-align: center;
    background: rgb(255 255 255 / 0.05);
    border: 1px solid rgb(255 255 255 / 0.08);
    --team: var(--color-violet-400);
  }
  .seat[data-team="0"] {
    --team: var(--color-honey-400);
  }
  .seat.you {
    border-color: var(--team);
    background: color-mix(in srgb, var(--team) 10%, transparent);
  }
  .seat.empty {
    border-style: dashed;
  }
  .team {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--team);
  }
  .seat strong {
    font-size: 0.88rem;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .placeholder {
    display: grid;
    place-items: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    color: var(--color-faint);
    border: 1.5px dashed rgb(255 255 255 / 0.2);
  }
  .state {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.7rem;
    color: var(--color-faint);
  }
  .state.ready {
    color: var(--color-mint-400);
  }
  .sit {
    margin-top: 0.15rem;
    min-height: 2.75rem;
    padding: 0.3rem 0.8rem;
    border-radius: 99px;
    font-size: 0.8rem;
    font-weight: 700;
    color: #1b1203;
    background: var(--color-honey-400);
  }
  .wait {
    color: var(--color-honey-300);
    font-weight: 600;
  }
  .friends ul {
    display: grid;
    gap: 0.35rem;
    list-style: none;
    padding: 0;
  }
  .friends li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.4rem 0.4rem 0.8rem;
    border-radius: 0.9rem;
    background: rgb(255 255 255 / 0.05);
  }
  .rules {
    border-radius: 1rem;
    background: rgb(255 255 255 / 0.04);
    border: 1px solid rgb(255 255 255 / 0.08);
  }
  .rules summary {
    padding: 0.8rem 1rem;
    font-weight: 650;
    cursor: pointer;
  }
  .rules-body {
    display: grid;
    gap: 0.9rem;
    padding: 0 1rem 1rem;
  }
  .summary {
    font-size: 0.8rem;
    color: var(--color-faint);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }
  .actions :global(.btn) {
    flex: 1 1 9rem;
  }
</style>
