<script lang="ts">
  // A seat at the table: the avatar (a bot's face changes with the game, US-088), the name and team, the cards left, the
  // dealer token (it slides to the next dealer, US-097), the contract badge, the latest call and the thinking dots.
  import { fly, scale } from "svelte/transition";
  import { localized, playerName, suitName, t } from "$lib/i18n/i18n.svelte";
  import { callKind } from "$lib/models/contract-badge";
  import { settings } from "$lib/stores/settings.svelte";
  import Avatar from "$lib/avatars/Avatar.svelte";
  import SuitText from "$lib/ui/SuitText.svelte";
  import type { Placement, SeatView, TableGame } from "./game.svelte";

  let { game, seat, placement }: { game: TableGame; seat: SeatView; placement: Placement } = $props();

  let avatar: HTMLElement;
  $effect(() => {
    game.anchors.seats.set(seat.index, avatar);
    return () => {
      if (game.anchors.seats.get(seat.index) === avatar) game.anchors.seats.delete(seat.index);
    };
  });

  const mine = $derived(game.contract?.player === seat.name ? game.contract : null);
  const contractText = $derived(mine ? (mine.value == null ? suitName(mine.suit, false) : `${mine.value} ${suitName(mine.suit, false)}`) : "");
  const count = $derived(localized({ code: "cards-count", params: { count: seat.cardCount } }));
  const label = $derived(
    t("{0}, {1}, {2}{3}", playerName(seat.name), t(seat.team), count, seat.active ? t(", active player") : "") +
      (mine ? t(", contract {0}", contractText) + (mine.coinched ? t(", coinched") : "") : "")
  );
  const kind = $derived(callKind(seat.call));
  const self = $derived(placement === "bottom");
  const shownName = $derived(self && seat.name !== "You" ? t("{0} · You", playerName(seat.name)) : playerName(seat.name));
  const red = (text: string) => /cœur|carreau|hearts|diamonds|harten|ruiten/i.test(text);

  // The dealer token flies from the previous dealer's seat (US-097).
  function dealerToken(node: HTMLElement) {
    const from = game.anchors.seats.get((seat.index + 3) % 4);
    if (settings.effects === "off" || !from || game.stage === "lobby") return;
    if (settings.effects === "reduced") {
      node.animate({ opacity: [0, 1] }, { duration: 200 });
      return;
    }
    const start = from.getBoundingClientRect();
    const end = node.getBoundingClientRect();
    if (!start.width || !end.width) return;
    node.animate([{ transform: `translate(${start.left - end.left}px, ${start.top - end.top}px) scale(1.3)` }, { transform: "none" }], { duration: 650, easing: "cubic-bezier(.3,.8,.3,1.15)" });
  }
</script>

<div class="seat {placement}" class:active={seat.active} class:self role="group" aria-label={label} data-team={seat.index % 2}>
  <div class="avatar-wrap" bind:this={avatar}>
    <span class="halo" aria-hidden="true"></span>
    <Avatar name={seat.name} expression={game.expressions[seat.index] ?? "neutral"} team={seat.index % 2} size={self ? "2.4rem" : "3rem"} />
    {#if seat.dealer}
      <span class="dealer hex" title={t("Dealer")} aria-label={t("Dealer")} role="img" use:dealerToken>D</span>
    {/if}
    {#if seat.thinking || (seat.active && game.stage === "play" && !self && game.trickWinner === null && !game.round && !game.dealing)}
      <span class="thinking" aria-hidden="true" transition:scale={{ duration: 200 }}><i></i><i></i><i></i></span>
    {/if}
  </div>
  <div class="details">
    <strong class="name">{shownName}</strong>
    {#if game.stage !== "lobby"}<small class="meta">{t(seat.team)} · {count}</small>{/if}
  </div>
  {#if mine}
    {#key game.contractBounce}
      <span class="badge" class:red={red(contractText)} aria-hidden="true" in:scale={{ start: settings.effects === "full" ? 0.4 : 1, duration: 420, opacity: 0.4 }}>
        <SuitText text={contractText} symbolOnly />{#if mine.coinched}<em>×2</em>{/if}
      </span>
    {/key}
  {/if}
  {#if seat.call && game.stage === "auction"}
    {#key seat.callFresh}
      <span class="call" class:stale={seat.stale} data-kind={kind} aria-hidden="true" in:fly={{ y: 10, duration: settings.effects === "full" ? 380 : 0, opacity: 0 }}>
        <SuitText text={localized(seat.call)} symbolOnly />
      </span>
    {/key}
  {/if}
  {#if !self && seat.cardCount > 0 && game.stage !== "lobby"}
    <span class="backs" aria-hidden="true">
      {#each Array.from({ length: Math.min(seat.cardCount, 8) }) as _, index (index)}<i style:--n={index} style:--total={Math.min(seat.cardCount, 8)}></i>{/each}
    </span>
  {/if}
</div>

<style>
  .seat {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    text-align: center;
    --team: var(--color-violet-400);
  }
  .seat[data-team="0"] {
    --team: var(--color-honey-400);
  }
  .seat.self,
  .seat.top {
    flex-direction: row;
    gap: 0.5rem;
    padding: 0.2rem 0.8rem 0.2rem 0.25rem;
    border-radius: 99px;
    background: rgb(0 0 0 / 0.25);
    border: 1px solid rgb(255 255 255 / 0.08);
    text-align: left;
  }
  .avatar-wrap {
    position: relative;
    border-radius: 50%;
    padding: 2px;
    background: rgb(255 255 255 / 0.12);
    transition: transform 0.45s var(--ease-spring);
  }
  .halo {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2.5px solid transparent;
    transition: border-color 0.3s, box-shadow 0.3s;
  }
  .active .avatar-wrap {
    transform: scale(1.08);
  }
  .active .halo {
    border-color: var(--table-accent, var(--color-honey-400));
    box-shadow: 0 0 22px color-mix(in srgb, var(--table-accent, #ffc22e) 70%, transparent);
  }
  :global([data-effects="full"]) .active .halo {
    animation: pulse-ring 1.6s ease-out infinite;
    --pulse: color-mix(in srgb, var(--table-accent, #ffc22e) 55%, transparent);
  }
  .details {
    display: grid;
    gap: 0.05rem;
    max-width: 7.5rem;
    padding: 0.2rem 0.55rem;
    border-radius: 0.8rem;
    background: rgb(0 0 0 / 0.3);
  }
  .self .details,
  .top .details {
    padding: 0;
    background: none;
    max-width: 12rem;
    text-align: left;
  }
  .seat.top {
    gap: 0.5rem;
    padding: 0.25rem 0.75rem 0.25rem 0.3rem;
    border-radius: 99px;
    background: rgb(0 0 0 / 0.28);
  }
  .top .backs {
    display: none;
  }
  .name {
    font-size: 0.82rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--team);
    white-space: nowrap;
  }
  @media (max-width: 420px) {
    .left .meta,
    .right .meta {
      display: none;
    }
    .left .details,
    .right .details {
      max-width: 4.6rem;
    }
  }
  .dealer {
    position: absolute;
    right: -0.45rem;
    bottom: -0.2rem;
    display: grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    font-size: 0.7rem;
    font-weight: 800;
    color: #1b1203;
    background: linear-gradient(140deg, #fff3c4, var(--color-honey-500));
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.4);
  }
  .thinking {
    position: absolute;
    left: 50%;
    top: -0.75rem;
    translate: -50% 0;
    display: flex;
    gap: 3px;
    padding: 0.3rem 0.45rem;
    border-radius: 99px;
    background: #fffaf0;
    box-shadow: 0 4px 10px rgb(0 0 0 / 0.35);
  }
  .thinking i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #3a3470;
    animation: dot 1s ease-in-out infinite;
  }
  .thinking i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .thinking i:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes dot {
    0%, 60%, 100% { translate: 0 0; opacity: 0.5; }
    30% { translate: 0 -3px; opacity: 1; }
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.55rem;
    border-radius: 0.6rem;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 0.9rem;
    color: var(--color-card-black);
    background: #fffaf0;
    box-shadow: 0 0 0 2px var(--team), 0 6px 14px -4px rgb(0 0 0 / 0.5);
    --suit-red: var(--color-card-red);
  }
  .badge :global(.suit) {
    color: var(--color-card-black);
  }
  .badge.red :global(.suit) {
    color: var(--color-card-red);
  }
  .badge em {
    font-style: normal;
    font-size: 0.75rem;
    padding: 0 0.25rem;
    border-radius: 0.3rem;
    color: #fff;
    background: var(--color-coral-500);
  }
  .call {
    position: absolute;
    z-index: 5;
    top: 0.75rem;
    left: calc(100% - 0.6rem);
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.35rem 0.7rem;
    border-radius: 1rem 1rem 1rem 0.25rem;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 0.95rem;
    white-space: nowrap;
    color: #1b1203;
    background: #fffaf0;
    box-shadow: 0 8px 18px -6px rgb(0 0 0 / 0.6);
    transition: opacity 0.4s, scale 0.4s;
    --suit-red: var(--color-card-red);
  }
  .right .call {
    left: auto;
    right: calc(100% - 0.6rem);
    border-radius: 1rem 1rem 0.25rem 1rem;
  }
  @media (max-width: 719px) {
    .left .call,
    .right .call {
      top: calc(100% + 0.3rem);
      border-radius: 1rem;
    }
    .left .call {
      left: 0;
    }
    .right .call {
      right: 0;
    }
  }
  .top .call {
    top: calc(100% + 0.35rem);
    left: 50%;
    translate: -50% 0;
    border-radius: 1rem;
  }
  .self .call {
    top: -2.4rem;
    left: 50%;
    translate: -50% 0;
    border-radius: 1rem;
  }
  .call[data-kind="pass"] {
    color: var(--color-muted);
    background: rgb(30 26 60 / 0.95);
    border: 1px solid rgb(255 255 255 / 0.15);
  }
  .call[data-kind="coinche"] {
    color: #fff;
    background: linear-gradient(180deg, #ff8fa3, var(--color-coral-500));
  }
  .call.stale {
    opacity: 0.55;
    scale: 0.9;
  }
  .backs {
    position: relative;
    display: block;
    width: 3.6rem;
    height: 1.6rem;
    margin-top: 0.1rem;
  }
  .backs i {
    position: absolute;
    left: 50%;
    bottom: 0;
    width: 1.05rem;
    height: 1.45rem;
    border-radius: 0.2rem;
    background: linear-gradient(160deg, var(--back-a), var(--back-b));
    box-shadow: inset 0 0 0 1.5px rgb(255 255 255 / 0.85), 0 2px 4px rgb(0 0 0 / 0.4);
    transform-origin: 50% 120%;
    translate: -50% 0;
    rotate: calc((var(--n) - (var(--total) - 1) / 2) * 9deg);
    transition: rotate 0.4s var(--ease-spring);
  }
  .left .backs,
  .right .backs {
    display: none;
  }
  @media (min-width: 640px) {
    .left .backs,
    .right .backs {
      display: block;
    }
  }
</style>
