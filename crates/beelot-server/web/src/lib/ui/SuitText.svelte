<script lang="ts">
  // Text with a drawn suit symbol (never a font character) before each suit name ("80 [heart] Hearts"). With `symbolOnly`
  // the name stays for screen readers but is hidden on screen. A suit is never smaller than 16px, so it reads on a phone.
  import { suitWordMap } from "$lib/i18n/i18n.svelte";
  import { splitSuitText } from "$lib/models/suit-text";
  import Suit from "$lib/cards/Suit.svelte";

  let { text, symbolOnly = false }: { text: string; symbolOnly?: boolean } = $props();
  const parts = $derived(splitSuitText(text, suitWordMap()));
</script>

{#each parts as part, index (index)}{#if typeof part === "string"}{part}{:else}<span class="suit-word" class:red={part.suit === "hearts" || part.suit === "diamonds"}><Suit suit={part.suit} />{#if symbolOnly}<span class="visually-hidden">{part.word}</span>{:else}<span>&nbsp;{part.word}</span>{/if}</span>{/if}{/each}

<style>
  .suit-word {
    display: inline-flex;
    align-items: baseline;
    white-space: nowrap;
  }
  .suit-word :global(.suit) {
    width: 1.2em;
    height: 1.2em;
    min-width: 16px;
    min-height: 16px;
    align-self: center;
    margin-inline: 0.08em;
  }
  .red :global(.suit) {
    color: var(--suit-red, var(--color-suit-red-dark));
  }
</style>
