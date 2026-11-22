<script lang="ts">
  // A suit glyph, drawn for the redesign (US-198). `suit` is CLUBS, DIAMONDS, HEARTS or SPADES in any case.
  let { suit, class: extra = "" }: { suit: string; class?: string } = $props();
  const key = $derived(String(suit).toUpperCase());
</script>

<svg class="suit {extra}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  {#if key === "HEARTS"}
    <path d="M50 90C22 70 5 52 5 31 5 16 16 6 29 6c9 0 16 5 21 13 5-8 12-13 21-13 13 0 24 10 24 25 0 21-17 39-45 59z" />
  {:else if key === "DIAMONDS"}
    <path d="M50 3c9 15 21 31 37 47-16 16-28 32-37 47-9-15-21-31-37-47C29 34 41 18 50 3z" />
  {:else if key === "SPADES"}
    <path d="M50 4C38 20 8 36 8 60c0 13 10 22 22 22 8 0 14-4 17-9-1 9-6 16-14 22h34c-8-6-13-13-14-22 3 5 9 9 17 9 12 0 22-9 22-22C92 36 62 20 50 4z" />
  {:else}
    <path d="M50 6a20 20 0 0 1 19 26 20 20 0 1 1-2 39c-6 0-12-3-15-7 1 11 6 19 14 26H34c8-7 13-15 14-26-3 4-9 7-15 7a20 20 0 1 1-2-39A20 20 0 0 1 50 6z" />
  {/if}
</svg>

<style>
  .suit {
    display: inline-block;
    width: 1em;
    height: 1em;
    fill: currentColor;
    flex: none;
  }
</style>
