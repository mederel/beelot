<script lang="ts">
  // The review of the round that just ended (US-066): step through the tricks from the deal, with every hand as it was;
  // the costly cards of a solo player (US-067) and why the bots played theirs (US-149).
  import { onMount } from "svelte";
  import { ChevronLeft, ChevronRight, X } from "@lucide/svelte";
  import { fly } from "svelte/transition";
  import { cardName, playerName, t } from "$lib/i18n/i18n.svelte";
  import { roundReviewModel } from "$lib/models/moments";
  import { costlyAtStep, costlySummary, explanationsAtStep } from "$lib/models/small";
  import { cardKey } from "$lib/models/card-physics";
  import PlayingCard from "$lib/cards/PlayingCard.svelte";
  import Button from "$lib/ui/Button.svelte";
  import { portal } from "$lib/ui/portal";
  import { HINT_REASONS, PLACEMENTS, type TableGame } from "./game.svelte";

  let { game }: { game: TableGame } = $props();
  const board = $derived(game.snapshot!.board!);
  let step = $state(0);
  let open = $state<string[]>([]);
  let nextButton: HTMLElement | null = $state(null);
  const model = $derived(roundReviewModel({ review: board.roundResult!.review, step })!);
  const placement = (seat: number) => PLACEMENTS[(seat - board.currentPlayerIndex + 4) % 4];
  const reasons = $derived(explanationsAtStep(game.review?.explanations, model.step, HINT_REASONS));
  const costly = $derived(costlyAtStep(game.review?.analysis, model.step));
  const costlyKeys = $derived(new Set(costly.map((entry: any) => `${entry.position}`)));
  const summary = $derived(model.step === 0 ? costlySummary(game.review?.analysis) : null);

  function go(by: number) {
    step = Math.min(model.steps, Math.max(0, model.step + by));
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") go(1);
    else if (event.key === "ArrowLeft") go(-1);
    else if (event.key === "Escape") game.closeReview();
  }

  onMount(() => {
    nextButton?.focus({ preventScroll: true });
    const main = document.getElementById("main");
    if (main) main.inert = true;
    return () => {
      if (main) main.inert = false;
    };
  });
</script>

<svelte:window onkeydown={keydown} />

<div class="review" use:portal role="dialog" aria-modal="true" aria-labelledby="review-title" transition:fly={{ y: 40, duration: 320, opacity: 0 }}>
  <header>
    <h2 id="review-title">{t("Review round")}</h2>
    <button class="close" type="button" aria-label={t("Back to result")} onclick={() => game.closeReview()}><X size={20} aria-hidden="true" /></button>
  </header>
  <div class="board">
    {#each model.hands as cards, seat (seat)}
      <div class="hand {placement(seat)}" class:winner={seat === model.winner}>
        <small>{playerName(board.seats[seat].name)}</small>
        <div class="cards">{#each cards as card (cardKey(card))}<PlayingCard {card} />{/each}</div>
      </div>
    {/each}
    <div class="trick">
      {#each model.trick as { seat, card }, position (cardKey(card))}
        <div class="slot {placement(seat)}" class:won={seat === model.winner} class:costly={costlyKeys.has(String(position))}>
          <PlayingCard {card} />
          {#if reasons.has(position)}
            {@const key = `${model.step}:${position}`}
            <button class="why" type="button" aria-expanded={open.includes(key)} onclick={() => (open = open.includes(key) ? open.filter((item) => item !== key) : [...open, key])}>{t(open.includes(key) ? "Hide reason" : "Why?")}</button>
            {#if open.includes(key)}<small class="why-text">{t(HINT_REASONS[reasons.get(position)!])}</small>{/if}
          {/if}
        </div>
      {/each}
    </div>
  </div>
  <p class="status" role="status" aria-live="polite">
    {model.step === 0 ? t("Deal") : `${t("Trick {0} of {1}", model.step, model.steps)} · ${t("{0} wins the trick", playerName(board.seats[model.winner ?? 0].name))}`}
  </p>
  {#if summary || costly.length}
    <p class="costly" role="status" aria-live="polite">
      {#if summary}{t(summary.text, ...summary.values)}{:else}{costly.map((entry: any) => t("Your {0} cost your team {1} points; the {2} was better.", cardName(entry.played), entry.pointsLost, cardName(entry.best))).join(" ")}{/if}
    </p>
  {/if}
  <div class="actions">
    <Button variant="secondary" disabled={model.step === 0} onclick={() => go(-1)}><ChevronLeft size={18} aria-hidden="true" />{t("Previous")}</Button>
    <Button bind:element={nextButton} disabled={model.step === model.steps} onclick={() => go(1)}>{t("Next")}<ChevronRight size={18} aria-hidden="true" /></Button>
  </div>
  <Button variant="ghost" onclick={() => game.closeReview()}>{t("Back to result")}</Button>
</div>

<style>
  .review {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    grid-template-rows: auto 1fr auto auto auto auto;
    gap: 0.6rem;
    padding: max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom));
    background: rgb(7 6 15 / 0.96);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    font-size: 1.4rem;
  }
  .close {
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.08);
  }
  .board {
    position: relative;
    min-height: 18rem;
    border-radius: 1.5rem;
    background: radial-gradient(70% 60% at 50% 45%, var(--felt-a), var(--felt-b));
    --cw: clamp(1.9rem, 7.5vw, 3rem);
  }
  .hand {
    position: absolute;
    display: grid;
    justify-items: center;
    gap: 0.2rem;
  }
  .hand small {
    font-size: 0.7rem;
    font-weight: 700;
    color: rgb(255 255 255 / 0.75);
  }
  .hand.winner small {
    color: var(--color-honey-300);
  }
  .cards {
    display: flex;
  }
  .cards :global(.face + .face) {
    margin-left: calc(var(--cw) * -0.45);
  }
  .hand.top {
    top: 0.5rem;
    left: 50%;
    translate: -50% 0;
  }
  .hand.bottom {
    bottom: 0.5rem;
    left: 50%;
    translate: -50% 0;
  }
  .hand.left,
  .hand.right {
    top: 50%;
    translate: 0 -50%;
  }
  .hand.left {
    left: 0.4rem;
  }
  .hand.right {
    right: 0.4rem;
  }
  .hand.left .cards,
  .hand.right .cards {
    flex-direction: column;
  }
  .hand.left .cards :global(.face + .face),
  .hand.right .cards :global(.face + .face) {
    margin-left: 0;
    margin-top: calc(var(--cw) * -1);
  }
  .trick {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    --cw: clamp(2.6rem, 11vw, 4rem);
  }
  .slot {
    position: absolute;
    display: grid;
    justify-items: center;
    gap: 0.2rem;
  }
  .slot.bottom {
    translate: -50% 5%;
  }
  .slot.top {
    translate: -50% -105%;
  }
  .slot.left {
    translate: -130% -50%;
  }
  .slot.right {
    translate: 30% -50%;
  }
  .slot.won :global(.face) {
    box-shadow: 0 0 0 3px var(--color-honey-400), 0 0 20px rgb(255 194 46 / 0.6);
  }
  .slot.costly :global(.face) {
    box-shadow: 0 0 0 3px var(--color-coral-500), 0 0 20px rgb(255 92 122 / 0.6);
  }
  .why {
    padding: 0.15rem 0.5rem;
    border-radius: 99px;
    font-size: 0.68rem;
    font-weight: 700;
    color: #1b1203;
    background: var(--color-honey-300);
  }
  .why-text {
    max-width: 8rem;
    padding: 0.3rem 0.5rem;
    border-radius: 0.6rem;
    font-size: 0.7rem;
    background: rgb(0 0 0 / 0.7);
    text-align: center;
  }
  .status {
    text-align: center;
    font-weight: 650;
  }
  .costly {
    text-align: center;
    font-size: 0.85rem;
    color: var(--color-coral-400);
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
</style>
