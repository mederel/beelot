<script lang="ts">
  // Text with a suit symbol before each suit name ("80 ♥ Hearts"). With `symbolOnly` the name stays for screen readers but
  // is hidden on screen.
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
    width: 0.95em;
    height: 0.95em;
    align-self: center;
  }
  .red :global(.suit) {
    color: var(--suit-red, #ff5c7a);
  }
</style>
