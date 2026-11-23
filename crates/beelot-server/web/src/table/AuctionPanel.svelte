<script lang="ts">
  // The auction (US-120): a panel over the bottom of the table for the player's own call. Classic Belote takes or passes
  // the upturned card, then chooses another trump; Contrée bids a value and a contract, and may coinche. Every disabled
  // choice says why in the line under the buttons; a hint lights the call the Challenging bot would make (US-065).
  import { fly } from "svelte/transition";
  import { localized, playerName, suitName, t } from "$lib/i18n/i18n.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import Button from "$lib/ui/Button.svelte";
  import SuitText from "$lib/ui/SuitText.svelte";
  import Suit from "$lib/cards/Suit.svelte";
  import PlayingCard from "$lib/cards/PlayingCard.svelte";
  import type { TableGame } from "./game.svelte";

  let { game }: { game: TableGame } = $props();
  const auction = $derived(game.auction!);
  const model = $derived(auction.model);

  let value = $state<number | null>(null);
  let suit = $state<string | null>(null);

  // One legal choice stays selected: the lowest value open, the first suit open; a hint chooses for the player.
  $effect(() => {
    const values = model.values ?? [];
    if (value === null || values.find((item) => item.value === value)?.disabled) value = values.find((item) => !item.disabled)?.value ?? model.bid?.value ?? null;
    const suits = model.suits;
    if (suit === null || suits.find((item) => item.suit === suit)?.disabled !== false) suit = suits.find((item) => !item.disabled)?.suit ?? model.bid?.suit ?? null;
  });
  $effect(() => {
    const hint = game.hintBid;
    if (hint?.type === "contract") {
      value = hint.value ?? value;
      suit = hint.suit ?? suit;
    }
  });

  const hint = $derived(game.hintBid);
  const hintOn = (kind: string, choice?: string) =>
    Boolean(hint) && (hint!.type === kind || (kind === "take" && hint!.type === "trump" && model.mode === "take")) && (choice === undefined || hint!.suit === choice);
  const disabled = $derived(auction.busy);
  const contractName = (key: string) => (key === "NO_TRUMPS" || key === "ALL_TRUMPS" ? t(key === "NO_TRUMPS" ? "No trumps" : "All trumps") : suitName(key));
  const isRed = (key: string) => key === "HEARTS" || key === "DIAMONDS";
  const title = $derived(model.titleSuit ? t(model.title, suitName(model.titleSuit)) : t(model.title));
</script>

{#if auction.open}
  <section class="auction glass" aria-labelledby="auction-title" transition:fly={{ y: settings.effects === "full" ? 240 : 0, duration: 380, opacity: 0 }}>
    <div class="head">
      <h2 id="auction-title"><SuitText text={title} /></h2>
      {#if auction.upturned}
        <div class="upturned" aria-label={t("Upturned card")}><PlayingCard card={auction.upturned} /></div>
      {/if}
    </div>

    {#if model.history.length}
      <ol class="history" aria-label={t("Bidding so far")}>
        {#each model.history as entry, index (index)}
          <li><span>{playerName(entry.playerName)}</span><SuitText text={localized(entry.callCode, entry.call ?? "")} symbolOnly /></li>
        {/each}
      </ol>
    {/if}

    {#if model.values}
      <div class="values" role="radiogroup" aria-label={t("Contract value")}>
        {#each model.values as item (item.value)}
          <label class="value" class:checked={value === item.value}>
            <input type="radio" name="auction-value" value={item.value} checked={value === item.value} disabled={item.disabled || disabled} onchange={() => (value = item.value)} />
            <span>{item.value}</span>
          </label>
        {/each}
      </div>
    {/if}

    {#if model.mode === "bid"}
      <div class="suits" role="radiogroup" aria-label={t("Trump suit")}>
        {#each model.suits as item (item.suit)}
          <label class="suit" class:checked={suit === item.suit} class:red={isRed(item.suit)} class:wide={item.suit === "NO_TRUMPS" || item.suit === "ALL_TRUMPS"}>
            <input type="radio" name="auction-suit" value={item.suit} checked={suit === item.suit} disabled={item.disabled || disabled} onchange={() => (suit = item.suit)} />
            {#if item.suit === "NO_TRUMPS" || item.suit === "ALL_TRUMPS"}<span class="word">{contractName(item.suit)}</span>{:else}<Suit suit={item.suit} /><span class="visually-hidden">{contractName(item.suit)}</span>{/if}
          </label>
        {/each}
      </div>
    {/if}

    {#if model.mode === "suit"}
      <div class="trumps">
        {#each model.suits as item (item.suit)}
          <button type="button" class="trump" class:red={isRed(item.suit)} class:hinted={hintOn("trump", item.suit)} disabled={item.disabled || disabled} onclick={() => game.bid("trump", { suit: item.suit })}>
            <Suit suit={item.suit} /><span>{contractName(item.suit)}</span>
          </button>
        {/each}
      </div>
    {/if}

    <p class="reason" id="auction-reason"><SuitText text={auction.reason} /></p>
    {#if game.hintReason}<p class="hint-reason" role="status"><SuitText text={game.hintReason} /></p>{/if}

    <div class="actions">
      <Button variant="secondary" class={hintOn("pass") ? "hinted" : ""} disabled={model.pass.disabled || disabled} aria-describedby="auction-reason" onclick={() => game.bid("pass")}>{t("Pass")}</Button>
      {#if model.take}
        <Button class={hintOn("take") ? "hinted" : ""} disabled={model.take.disabled || disabled} aria-describedby="auction-reason" onclick={() => game.bid("trump", { suit: model.take!.suit! })}>
          <SuitText text={t("Take {0}", suitName(model.take.suit))} />
        </Button>
      {/if}
      {#if model.bid}
        <Button class={hintOn("contract") ? "bid hinted" : "bid"} disabled={model.bid.disabled || disabled || value === null || suit === null} aria-describedby="auction-reason" onclick={() => game.bid("contract", { value: value!, suit: suit! })}>
          <SuitText text={t("Bid {0}", `${value} ${contractName(suit ?? "")}`)} />
        </Button>
      {/if}
      {#if model.coinche.shown}
        <Button variant="danger" class={hintOn("coinche") ? "hinted" : ""} disabled={model.coinche.disabled || disabled} aria-describedby="auction-reason" onclick={() => game.bid("coinche")}>{t("Coinche")}</Button>
      {/if}
    </div>
  </section>
{/if}

<style>
  /* The panel and its buttons take their size from the screen's width and height, whichever is smaller, so the hand stays
     on screen: on a short phone the choices shrink, and the panel scrolls only if it still does not fit above the hand. */
  .auction {
    position: relative;
    z-index: 20;
    width: 100%;
    max-width: 34rem;
    max-height: calc(100dvh - var(--auction-reserve, 16rem));
    overflow-y: auto;
    overscroll-behavior: contain;
    margin: 0 auto 0.2rem;
    display: grid;
    gap: clamp(0.35rem, 1.3dvh, 0.6rem);
    padding: clamp(0.6rem, 1.6dvh, 0.9rem) 1rem clamp(0.7rem, 1.8dvh, 1rem);
    border-radius: 1.6rem;
    background: linear-gradient(180deg, rgb(32 28 66 / 0.94), rgb(17 15 36 / 0.96));
    box-shadow: 0 -10px 50px -10px rgb(0 0 0 / 0.8), inset 0 1px 0 rgb(255 255 255 / 0.1);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  h2 {
    font-size: 1.3rem;
    font-weight: 800;
    line-height: 1.1;
    --suit-red: var(--color-suit-red-dark);
  }
  .upturned {
    --cw: 2.9rem;
    rotate: 6deg;
    filter: drop-shadow(0 8px 18px rgb(0 0 0 / 0.5));
  }
  .history {
    display: flex;
    gap: 0.3rem;
    overflow-x: auto;
    list-style: none;
    padding: 0 0 0.15rem;
    margin: 0;
    scrollbar-width: none;
  }
  .history li {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    flex: none;
    padding: 0.25rem 0.65rem;
    border-radius: 99px;
    font-size: 0.85rem;
    font-weight: 650;
    background: rgb(255 255 255 / 0.07);
    --suit-red: var(--color-suit-red-dark);
  }
  .history li span:first-child {
    color: var(--color-muted);
  }
  .values {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.35rem;
  }
  .value,
  .suit {
    position: relative;
    display: grid;
    place-items: center;
    min-height: clamp(2.2rem, min(9.5vw, 5.6dvh), 2.7rem);
    border-radius: 0.8rem;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(0.95rem, min(4.4vw, 3.4dvh), 1.1rem);
    background: rgb(255 255 255 / 0.06);
    border: 1.5px solid rgb(255 255 255 / 0.08);
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, transform 0.35s var(--ease-spring);
  }
  .value:has(input:disabled),
  .suit:has(input:disabled) {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .value.checked,
  .suit.checked {
    color: #1b1203;
    background: linear-gradient(180deg, var(--color-honey-300), var(--color-honey-500));
    border-color: transparent;
    transform: translateY(-2px);
  }
  .value input,
  .suit input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: inherit;
  }
  .value:has(input:focus-visible),
  .suit:has(input:focus-visible) {
    outline: 3px solid var(--color-honey-400);
    outline-offset: 2px;
  }
  .suits {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.35rem;
  }
  .suit.wide {
    grid-column: span 2;
  }
  .suit :global(.suit) {
    width: 1.7rem;
    height: 1.7rem;
  }
  .suit.red:not(.checked) :global(.suit) {
    color: var(--color-suit-red-dark);
  }
  .suit.checked.red :global(.suit) {
    color: var(--color-suit-red-on-honey);
  }
  .word {
    font-size: 0.82rem;
  }
  .trumps {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.4rem;
  }
  .trump {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-height: clamp(2.4rem, min(10vw, 6.2dvh), 3rem);
    border-radius: 1rem;
    font-weight: 700;
    background: rgb(255 255 255 / 0.08);
    border: 1.5px solid rgb(255 255 255 / 0.1);
    transition: transform 0.35s var(--ease-spring), background 0.2s;
  }
  .trump:active:not(:disabled) {
    transform: scale(0.95);
  }
  .trump:disabled {
    opacity: 0.3;
  }
  .trump :global(.suit) {
    width: 1.3rem;
    height: 1.3rem;
  }
  .trump.red :global(.suit) {
    color: var(--color-suit-red-dark);
  }
  .reason,
  .hint-reason {
    font-size: 0.8rem;
    color: var(--color-muted);
    --suit-red: var(--color-suit-red-dark);
  }
  .hint-reason {
    color: var(--color-honey-300);
    font-weight: 650;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: clamp(0.3rem, 1dvh, 0.45rem);
  }
  /* Pass and the other short choices share a row; the long bid label takes a row of its own, below them. */
  .actions :global(.btn) {
    flex: 1 1 auto;
    min-height: clamp(2.5rem, min(12vw, 6.4dvh), 3.1rem);
    font-size: clamp(0.9rem, min(4.2vw, 3.2dvh), 1.05rem);
    --suit-red: var(--color-suit-red-on-honey);
  }
  .actions :global(.btn.bid) {
    order: 1;
    flex-basis: 100%;
  }
  .actions :global(.btn.hinted),
  .hinted {
    box-shadow: 0 0 0 3px var(--color-honey-300), 0 0 30px rgb(255 194 46 / 0.7) !important;
  }
</style>
