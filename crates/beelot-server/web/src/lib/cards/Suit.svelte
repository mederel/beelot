<script lang="ts">
  // THE suit symbol: an inline SVG we draw (suit-shapes.ts), never a font character. `suit` is CLUBS, DIAMONDS, HEARTS or
  // SPADES in any case. It is hidden from screen readers: the suit's name is always written next to it (or in the label of
  // the card or button that holds it), so nothing is read twice.
  import { SUIT_SHAPES, suitKey } from "./suit-shapes";

  let { suit, class: extra = "" }: { suit: string; class?: string } = $props();
  const key = $derived(suitKey(suit));
  const shape = $derived(SUIT_SHAPES[key]);
</script>

<svg class="suit {extra}" viewBox="0 0 100 100" aria-hidden="true" focusable="false" data-suit={key}>
  {#each shape.lobes as [cx, cy, r], index (index)}
    <circle data-lobe cx={cx} cy={cy} r={r} />
  {/each}
  <path data-body d={shape.path} />
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
