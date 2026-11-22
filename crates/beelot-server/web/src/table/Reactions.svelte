<script lang="ts">
  // Reactions at online tables (US-020): a button opens the six presets (a side panel that stays open from 1024 px,
  // US-125); a tap sends one. A reaction shows for a few seconds beside the seat it came from.
  import { SmilePlus } from "@lucide/svelte";
  import { scale, fly } from "svelte/transition";
  import { t } from "$lib/i18n/i18n.svelte";
  import { REACTIONS, type TableGame } from "./game.svelte";

  let { game }: { game: TableGame } = $props();
  const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  $effect(() => {
    if (game.reactions.allowed && wide) game.reactions.tray = true;
  });
</script>

<div class="reaction-layer" aria-live="polite">
  {#each game.bubbles as bubble (bubble.key)}
    <p class="bubble {game.placement(bubble.seat)}" aria-label={t("{0}: {1}", game.seats[bubble.seat]?.name ?? "", bubble.text)} transition:scale={{ start: 0.5, duration: 280 }}>{bubble.text}</p>
  {/each}
</div>

{#if game.reactions.allowed}
  <button class="toggle" type="button" aria-expanded={game.reactions.tray} aria-controls="reaction-tray" aria-label={t("Open reactions")} onclick={() => (game.reactions.tray = !game.reactions.tray)}>
    <SmilePlus size={22} aria-hidden="true" />
  </button>
  {#if game.reactions.tray}
    <div class="tray glass" id="reaction-tray" role="group" aria-label={t("Reactions")} transition:fly={{ x: 30, duration: 240 }}>
      {#each Object.entries(REACTIONS) as [key, [emoji, label]] (key)}
        <button type="button" onclick={() => game.react(key)}><span aria-hidden="true">{emoji}</span> {t(label)}</button>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .reaction-layer {
    position: absolute;
    inset: 0;
    z-index: 9;
    pointer-events: none;
  }
  .bubble {
    position: absolute;
    padding: 0.45rem 0.8rem;
    border-radius: 1rem;
    font-weight: 700;
    font-size: 0.9rem;
    color: #1b1203;
    background: #fffaf0;
    box-shadow: 0 10px 24px -8px rgb(0 0 0 / 0.7);
  }
  .bubble.top {
    top: 5.5rem;
    left: 50%;
    translate: -50% 0;
  }
  .bubble.left {
    top: calc(42% - 4rem);
    left: 0.5rem;
  }
  .bubble.right {
    top: calc(42% - 4rem);
    right: 0.5rem;
  }
  .bubble.bottom {
    bottom: 0.8rem;
    left: 50%;
    translate: -50% 0;
  }
  .toggle {
    position: absolute;
    z-index: 10;
    right: 0.6rem;
    bottom: 0.6rem;
    display: grid;
    place-items: center;
    width: 2.9rem;
    height: 2.9rem;
    border-radius: 50%;
    color: #1b1203;
    background: linear-gradient(180deg, var(--color-honey-300), var(--color-honey-500));
    box-shadow: 0 8px 20px -6px rgb(255 159 28 / 0.8);
  }
  .tray {
    position: absolute;
    z-index: 10;
    right: 0.6rem;
    bottom: 4rem;
    display: grid;
    gap: 0.25rem;
    padding: 0.4rem;
    border-radius: 1.1rem;
    background: rgb(20 17 40 / 0.95);
  }
  .tray button {
    min-height: 2.5rem;
    padding: 0 0.8rem;
    border-radius: 0.8rem;
    text-align: left;
    font-weight: 600;
    font-size: 0.88rem;
  }
  .tray button:hover {
    background: rgb(255 255 255 / 0.08);
  }
</style>
