<script lang="ts">
  // The card table (US-119): the header with the scores and the menu, the felt with the four seats and the trick, the hand,
  // and what comes over them: the auction (US-120), the online lobby (US-121), the round's result, the match end, the
  // round review, the reactions, the pass-and-play cover and the leave question.
  import { onDestroy, onMount, untrack } from "svelte";
  import { fade, fly, scale } from "svelte/transition";
  import { t } from "$lib/i18n/i18n.svelte";
  import { openHelp } from "$lib/stores/sheets.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import Sheet from "$lib/ui/Sheet.svelte";
  import Button from "$lib/ui/Button.svelte";
  import SuitText from "$lib/ui/SuitText.svelte";
  import Bee from "$lib/brand/Bee.svelte";
  import PlayingCard from "$lib/cards/PlayingCard.svelte";
  import { MOMENTS } from "$lib/models/moments";
  import { TableGame } from "./game.svelte";
  import TableHeader from "./TableHeader.svelte";
  import Seat from "./Seat.svelte";
  import Trick from "./Trick.svelte";
  import Hand from "./Hand.svelte";
  import AuctionPanel from "./AuctionPanel.svelte";
  import LobbyPanel from "./LobbyPanel.svelte";
  import RoundResult from "./RoundResult.svelte";
  import MatchEnd from "./MatchEnd.svelte";
  import RoundReview from "./RoundReview.svelte";
  import Reactions from "./Reactions.svelte";
  import CoachPanel from "./CoachPanel.svelte";

  let { id, phase }: { id: string; phase: "auction" | "online" | null } = $props();

  // The view is keyed by the table id, so the game is made once for its id.
  const game = untrack(() => new TableGame(id, phase));
  let layer: HTMLDivElement;
  let felt: HTMLDivElement;

  $effect(() => {
    if (phase !== game.phase) game.setPhase(phase);
  });

  // A coinche shakes the table (full effects only).
  $effect(() => {
    if (game.shake && settings.effects === "full" && felt) {
      felt.animate([{ transform: "translate(0,0)" }, { transform: "translate(-6px,2px) rotate(-0.4deg)" }, { transform: "translate(5px,-2px) rotate(0.3deg)" }, { transform: "translate(-3px,1px)" }, { transform: "translate(0,0)" }], { duration: 420, easing: "ease-out" });
    }
  });

  onMount(() => {
    game.anchors.layer = layer;
    game.load();
  });
  onDestroy(() => game.destroy());

  const placements = ["top", "left", "right"] as const;
  const seatAt = (placement: string) => game.seats.find((seat) => game.placement(seat.index) === placement);

  function openRules() {
    openHelp({ hint: game.hintAvailable ? () => game.askHint() : null });
  }
</script>

<div class="table-screen" data-stage={game.stage}>
  <h1 class="visually-hidden">{game.title}</h1>
  <TableHeader {game} onRules={openRules} />

  <div class="felt" bind:this={felt} aria-label={t("Four-player card table")}>
    <div class="ring" aria-hidden="true"></div>
    {#each placements as placement (placement)}
      {@const seat = seatAt(placement)}
      {#if seat && seat.name}
        <div class="seat-slot {placement}"><Seat {game} {seat} {placement} /></div>
      {/if}
    {/each}

    <div class="centre" bind:this={game.anchors.centre}>
      {#if game.stage === "play"}
        <span class="trick-count" aria-hidden="true">{t("Trick {0} / 8", game.completedTricks)}</span>
      {/if}
      <Trick {game} />
      {#if game.stage === "auction" && game.auction?.bidding.upturnedCard && !game.dealing}
        <!-- Classic Belote: the card to take stays face up in the middle of the table, as in a real deal, until a player takes it. -->
        <div class="upturned-card" aria-hidden="true" in:fly={{ y: settings.effects === "full" ? -90 : 0, duration: 420, opacity: 0 }}>
          <PlayingCard card={game.auction.bidding.upturnedCard} />
        </div>
      {/if}
      {#if game.stage === "lobby"}
        <div class="lobby-art" aria-hidden="true"><Bee size="4rem" /></div>
      {/if}
    </div>

    {#if game.botLine}
      {@const line = game.botLine}
      {#key line.key}
        <p class="bot-line {game.placement(line.seat)}" aria-hidden="true" transition:scale={{ start: 0.6, duration: 260 }}>{line.text}</p>
      {/key}
    {/if}

    {#if game.celebration}
      {@const moment = game.celebration}
      {#key moment.key}
        <div class="celebration" data-kind={moment.kind} aria-hidden="true" in:scale={{ start: 0.3, duration: 520, easing: (x) => 1 - Math.pow(1 - x, 3) * Math.cos(x * 6) * 0.9 }} out:fade={{ duration: 220 }}>
          <strong>{t(MOMENTS[moment.kind].text)}</strong>
          {#if moment.chips.length}
            <span class="moment-chips">{#each moment.chips as chip, index (index)}<span>{chip.kind === "points" ? chip.text : t(chip.text)}</span>{/each}</span>
          {/if}
        </div>
      {/key}
    {/if}

    {#if game.toast}
      {@const toast = game.toast}
      {#key toast.key}
        <div class="toast {toast.kind}" role="status" in:fly={{ y: -12, duration: 260 }} out:fade={{ duration: 160 }}><SuitText text={toast.text} /></div>
      {/key}
    {/if}

    <Reactions {game} />
  </div>

  <div class="bottom">
    {#if game.tutorial}
      <CoachPanel {game} />
    {/if}
    {#if game.stage === "auction" && game.auction}
      <AuctionPanel {game} />
    {/if}
    {#if game.declare || game.chips.length}
      <div class="chips" transition:fly={{ y: 10, duration: 240 }}>
        {#if game.declare}
          <button class="chip declare" type="button" role="switch" aria-checked={game.declareOn} onclick={() => (game.declareOn = !game.declareOn)}>
            <span class="tick" aria-hidden="true">{game.declareOn ? "✓" : ""}</span>{game.declare.label}
          </button>
        {/if}
        {#each game.chips as chip (chip.id)}
          <button class="chip" class:scored={chip.scored} type="button" onclick={() => game.pushToast(chip.detail, "detail")}>{chip.text}</button>
        {/each}
      </div>
    {/if}
    {#if game.seats.length && game.stage !== "lobby" && !(game.stage === "auction" && game.auction?.open)}
      {@const me = game.seats[game.viewer]}
      {#if me}<div class="me"><Seat {game} seat={me} placement="bottom" /></div>{/if}
    {/if}
    <Hand {game} />
  </div>

  {#if game.stage === "lobby" && game.lobby}
    <LobbyPanel {game} />
  {/if}
  {#if game.round && game.stage === "play"}
    <RoundResult {game} />
  {/if}
</div>

<div class="deal-layer" bind:this={layer} aria-hidden="true"></div>

{#if game.matchEnd}
  <MatchEnd {game} />
{/if}
{#if game.review && game.snapshot?.board?.roundResult}
  <RoundReview {game} />
{/if}

<Sheet open={Boolean(game.handoff)} variant="cover" dismissible={false} labelledby="handoff-title">
  <div class="handoff">
    <Bee size="4.5rem" />
    <p class="eyebrow">{t("Pass and play")}</p>
    <h2 id="handoff-title">{t("Pass the device to {0}", game.handoff?.name ?? "")}</h2>
    <p>{t("Keep your cards hidden from the other players.")}</p>
    <Button size="lg" onclick={() => game.handoffReady()}>{t("I'm ready")}</Button>
  </div>
</Sheet>

<Sheet bind:open={game.leave.open} variant="dialog" labelledby="leave-title" describedby="leave-message">
  <div class="leave">
    <h2 id="leave-title">{game.leave.title}</h2>
    <p id="leave-message">{game.leave.message}</p>
    <div class="leave-actions">
      <Button onclick={() => (game.leave.open = false)}>{t("Stay")}</Button>
      <Button variant="danger" onclick={() => game.confirmLeave()}>{t("Leave")}</Button>
    </div>
  </div>
</Sheet>

<style>
  .table-screen {
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100dvh;
    overflow: hidden;
    padding: max(0.5rem, env(safe-area-inset-top)) max(0.5rem, env(safe-area-inset-right)) 0 max(0.5rem, env(safe-area-inset-left));
    --hand-cw: clamp(3.9rem, 18.5vw, 6.4rem);
    --trick-cw: clamp(3.5rem, 15vw, 5.4rem);
    /* The room the header, the margins and the hand take, whatever its size: the auction panel never grows past the rest of the screen. */
    --auction-reserve: calc(8.3rem + var(--hand-cw) * 1.4 + 1.6rem);
  }
  @media (min-width: 1024px) {
    .table-screen {
      --hand-cw: clamp(5rem, 7.2vw, 7rem);
      --trick-cw: clamp(4.6rem, 6vw, 6.2rem);
      padding: 1rem 1.5rem 0;
    }
  }
  @media (max-height: 640px) and (orientation: landscape) {
    .table-screen {
      --hand-cw: clamp(3.2rem, 9vh, 4.6rem);
      --trick-cw: clamp(3rem, 12vh, 4.2rem);
    }
  }
  .felt {
    position: relative;
    margin: 0.4rem 0;
    border-radius: 2.25rem;
    background:
      var(--felt-pattern),
      radial-gradient(70% 60% at 50% 45%, color-mix(in srgb, var(--felt-a) 100%, white 6%), var(--felt-b) 85%);
    box-shadow:
      inset 0 0 0 1px rgb(255 255 255 / 0.08),
      inset 0 0 80px rgb(0 0 0 / 0.45),
      0 30px 60px -30px rgb(0 0 0 / 0.9);
    isolation: isolate;
    min-height: 0;
  }
  @media (min-width: 1024px) {
    .felt {
      margin: 0.75rem auto;
      width: min(100%, 72rem);
      border-radius: 50% / 40%;
    }
  }
  .ring {
    position: absolute;
    inset: 9% 7%;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--ring) 45%, transparent);
    box-shadow: 0 0 40px var(--ring-soft), inset 0 0 40px var(--ring-soft);
    pointer-events: none;
    z-index: -1;
  }
  :global([data-effects="full"]) .ring {
    animation: ring-breathe 6s ease-in-out infinite;
  }
  @keyframes ring-breathe {
    50% {
      box-shadow: 0 0 60px var(--ring-soft), inset 0 0 60px var(--ring-soft);
      border-color: color-mix(in srgb, var(--ring) 70%, transparent);
    }
  }
  .seat-slot {
    position: absolute;
    z-index: 3;
  }
  .seat-slot.top {
    top: 0.6rem;
    left: 50%;
    translate: -50% 0;
  }
  .seat-slot.left {
    top: 42%;
    left: 0.4rem;
    translate: 0 -50%;
  }
  .seat-slot.right {
    top: 42%;
    right: 0.4rem;
    translate: 0 -50%;
  }
  @media (min-width: 1024px) {
    .seat-slot.left {
      left: 3%;
    }
    .seat-slot.right {
      right: 3%;
    }
    .seat-slot.top {
      top: 4%;
    }
  }
  .centre {
    position: absolute;
    left: 50%;
    top: 54%;
    translate: -50% -50%;
    width: calc(var(--trick-cw) * 3.2);
    height: calc(var(--trick-cw) * 1.4 * 2.1);
    z-index: 2;
  }
  .upturned-card {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    --cw: calc(var(--trick-cw) * 1.1);
    rotate: -4deg;
    filter: drop-shadow(0 10px 22px rgb(0 0 0 / 0.55)) drop-shadow(0 0 14px rgb(255 200 80 / 0.35));
  }
  .trick-count {
    position: absolute;
    left: 50%;
    bottom: 100%;
    translate: -50% -0.4rem;
    padding: 0.15rem 0.6rem;
    border-radius: 99px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgb(255 255 255 / 0.55);
    background: rgb(0 0 0 / 0.25);
    white-space: nowrap;
    display: none;
  }
  @media (min-height: 700px) {
    .trick-count {
      display: block;
    }
  }
  .lobby-art {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    opacity: 0.6;
  }
  .bot-line {
    position: absolute;
    z-index: 6;
    max-width: 11rem;
    padding: 0.55rem 0.8rem;
    border-radius: 1rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #1b1203;
    background: #fffaf0;
    box-shadow: 0 10px 24px -10px rgb(0 0 0 / 0.7);
  }
  .bot-line.top {
    top: 3.6rem;
    left: 50%;
    translate: -50% 0;
    border-top-left-radius: 0.25rem;
  }
  .bot-line.left {
    bottom: calc(58% + 2.6rem);
    left: 0.6rem;
    border-bottom-left-radius: 0.25rem;
  }
  .bot-line.right {
    bottom: calc(58% + 2.6rem);
    right: 0.6rem;
    border-bottom-right-radius: 0.25rem;
  }
  .bot-line.bottom {
    bottom: 1rem;
    left: 50%;
    translate: -50% 0;
  }
  .celebration {
    position: absolute;
    inset: 0;
    z-index: 8;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.6rem;
    pointer-events: none;
  }
  .celebration strong {
    padding: 0.4rem 1.4rem 0.55rem;
    border-radius: 1.2rem;
    font-family: var(--font-display);
    font-size: clamp(2.2rem, 11vw, 4rem);
    font-weight: 800;
    letter-spacing: -0.04em;
    color: #1b1203;
    background: linear-gradient(180deg, var(--color-honey-300), var(--color-honey-600));
    box-shadow: 0 0 0 4px rgb(255 255 255 / 0.15), 0 24px 60px -10px rgb(255 159 28 / 0.8);
    rotate: -4deg;
  }
  .celebration[data-kind="contractLost"] strong {
    color: #fff;
    background: linear-gradient(180deg, #ff8fa3, var(--color-coral-500));
    box-shadow: 0 24px 60px -10px rgb(255 92 122 / 0.7);
  }
  .celebration[data-kind="coincheWon"] strong {
    color: #fff;
    background: linear-gradient(180deg, var(--color-violet-400), var(--color-violet-600));
  }
  .moment-chips {
    display: flex;
    gap: 0.4rem;
  }
  .moment-chips span {
    padding: 0.3rem 0.75rem;
    border-radius: 99px;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--color-ink);
    background: rgb(0 0 0 / 0.45);
    border: 1px solid rgb(255 255 255 / 0.2);
  }
  .toast {
    position: absolute;
    z-index: 7;
    left: 50%;
    top: 30%;
    translate: -50% 0;
    max-width: min(22rem, 86%);
    padding: 0.6rem 1rem;
    border-radius: 1rem;
    font-size: 0.88rem;
    font-weight: 600;
    text-align: center;
    color: var(--color-ink);
    background: rgb(12 10 26 / 0.88);
    border: 1px solid rgb(255 255 255 / 0.14);
    box-shadow: 0 16px 30px -14px rgb(0 0 0 / 0.9);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .toast.hint {
    border-color: rgb(255 194 46 / 0.5);
    color: var(--color-honey-200);
  }
  .bottom {
    position: relative;
    display: grid;
    gap: 0.3rem;
    padding-bottom: max(0.4rem, env(safe-area-inset-bottom));
  }
  .me {
    display: flex;
    justify-content: center;
    position: relative;
    z-index: 4;
  }
  .chips {
    display: flex;
    justify-content: safe center;
    gap: 0.35rem;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 0 0.25rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    flex: none;
    gap: 0.35rem;
    min-height: 2rem;
    padding: 0 0.75rem;
    border-radius: 99px;
    font-size: 0.8rem;
    font-weight: 650;
    color: var(--color-ink);
    background: rgb(255 255 255 / 0.08);
    border: 1px solid rgb(255 255 255 / 0.14);
  }
  .chip.scored {
    color: #1b1203;
    background: var(--color-honey-400);
  }
  .chip.declare[aria-checked="true"] {
    color: #1b1203;
    background: linear-gradient(180deg, var(--color-honey-300), var(--color-honey-500));
  }
  .tick {
    display: grid;
    place-items: center;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 0.35rem;
    font-size: 0.75rem;
    background: rgb(0 0 0 / 0.15);
  }
  .handoff {
    display: grid;
    justify-items: center;
    gap: 0.8rem;
    max-width: 22rem;
    padding: 2rem 1rem;
    text-align: center;
  }
  .handoff h2 {
    font-size: 1.9rem;
    font-weight: 800;
  }
  .handoff p:not(.eyebrow) {
    color: var(--color-muted);
  }
  .leave {
    display: grid;
    gap: 0.8rem;
  }
  .leave h2 {
    font-size: 1.4rem;
  }
  .leave p {
    color: var(--color-muted);
  }
  .leave-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }
</style>
