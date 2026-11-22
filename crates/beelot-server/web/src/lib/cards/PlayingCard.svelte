<script lang="ts">
  // A card face of the redesigned deck (US-198): an ivory card, a large rank, a big suit glyph in the middle of the pip
  // cards and a geometric court card (a monogram under a crown). Every card keeps both its symbol and its colour. The size
  // comes from `--cw` (the card's width) set by the parent; everything inside scales with it (container units).
  import type { Card } from "$lib/api/types";
  import { cardName, rankLabel } from "$lib/i18n/i18n.svelte";
  import Suit from "./Suit.svelte";

  let { card, label = true, class: extra = "" }: { card: Pick<Card, "rank" | "suit">; label?: boolean; class?: string } = $props();

  const red = $derived(card.suit === "HEARTS" || card.suit === "DIAMONDS");
  const court = $derived(card.rank === "J" || card.rank === "Q" || card.rank === "K");
  const shown = $derived(rankLabel(card.rank));
</script>

<div class="face {extra}" class:red class:court role={label ? "img" : undefined} aria-label={label ? cardName(card) : undefined} data-card="{card.rank}-{card.suit}">
  <span class="index top" aria-hidden="true"><b>{shown}</b><Suit suit={card.suit} /></span>
  <span class="index bottom" aria-hidden="true"><b>{shown}</b><Suit suit={card.suit} /></span>
  {#if court}
    <span class="portrait" aria-hidden="true">
      <svg class="crown" viewBox="0 0 60 30">
        {#if card.rank === "K"}
          <path d="M4 27 8 6l12 11L30 2l10 15L52 6l4 21z" />
        {:else if card.rank === "Q"}
          <path d="M6 27c0-9 2-16 6-20 3 6 7 9 10 9 2-6 5-11 8-14 3 3 6 8 8 14 3 0 7-3 10-9 4 4 6 11 6 20z" />
          <circle cx="30" cy="3.5" r="3" />
        {:else}
          <path d="M8 27V14l8-8h28l8 8v13z" />
          <path class="cut" d="M22 6v21M38 6v21" />
        {/if}
      </svg>
      <span class="monogram">{shown}</span>
      <Suit suit={card.suit} class="small" />
    </span>
  {:else}
    <span class="pip" class:ace={card.rank === "A"} aria-hidden="true"><Suit suit={card.suit} /></span>
  {/if}
</div>

<style>
  .face {
    --ink: var(--color-card-black);
    position: relative;
    display: block;
    width: var(--cw, 4.5rem);
    aspect-ratio: 5 / 7;
    container-type: inline-size;
    border-radius: calc(var(--cw, 4.5rem) * 0.1);
    background:
      radial-gradient(120% 80% at 30% 10%, #fff 0%, transparent 60%),
      linear-gradient(160deg, #fffdf7, var(--color-card) 60%, #f6eedb);
    box-shadow:
      inset 0 0 0 1px rgb(23 20 46 / 0.08),
      inset 0 0 0 calc(var(--cw, 4.5rem) * 0.025) #fff,
      inset 0 0 0 calc(var(--cw, 4.5rem) * 0.025 + 1px) rgb(23 20 46 / 0.05),
      var(--shadow-card);
    color: var(--ink);
    overflow: hidden;
    user-select: none;
  }
  .red {
    --ink: var(--color-card-red);
  }
  .index {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5cqw;
    width: 24cqw;
    line-height: 0.82;
  }
  .index b {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 27cqw;
    letter-spacing: -0.07em;
  }
  .index :global(.suit) {
    width: 20cqw;
    height: 20cqw;
  }
  .top {
    top: 6cqw;
    left: 5cqw;
  }
  .bottom {
    right: 5cqw;
    bottom: 6cqw;
    rotate: 180deg;
  }
  .pip {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  .pip :global(.suit) {
    width: 52cqw;
    height: 52cqw;
    filter: drop-shadow(0 1.5cqw 1.5cqw rgb(23 20 46 / 0.15));
  }
  .pip.ace :global(.suit) {
    width: 66cqw;
    height: 66cqw;
  }
  .portrait {
    position: absolute;
    inset: 15cqw 15cqw;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1cqw;
    border-radius: 6cqw;
    background:
      linear-gradient(160deg, color-mix(in srgb, var(--ink) 14%, transparent), color-mix(in srgb, var(--ink) 4%, transparent));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 25%, transparent);
  }
  .crown {
    width: 34cqw;
    fill: color-mix(in srgb, var(--color-honey-500) 85%, var(--ink));
    stroke: var(--ink);
    stroke-width: 2.2;
    stroke-linejoin: round;
  }
  .crown .cut {
    fill: none;
    stroke-width: 2;
  }
  .monogram {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 34cqw;
    line-height: 0.85;
    letter-spacing: -0.05em;
  }
  .portrait :global(.small) {
    width: 14cqw;
    height: 14cqw;
  }
</style>
