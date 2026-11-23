<script lang="ts">
  // The other three hands, face up (US-199): a tutorial shows every card so that the coach can say why one is played and not
  // another. Three small fans side by side, each under its player's name, so they fit a phone's width.
  import { cardName, playerName, t } from "$lib/i18n/i18n.svelte";
  import { cardKey } from "$lib/models/card-physics";
  import PlayingCard from "$lib/cards/PlayingCard.svelte";
  import type { TableGame } from "./game.svelte";

  let { game }: { game: TableGame } = $props();

  const others = $derived(
    game.openHands
      ? [1, 2, 3].map((offset) => {
          const index = (game.viewer + offset) % 4;
          return { index, name: playerName(game.seats[index]?.name), cards: game.openHands![index] ?? [] };
        })
      : []
  );
</script>

{#if others.length}
  <div class="open-hands" role="group" aria-label={t("The other players' cards, face up")}>
    {#each others as other (other.index)}
      <div class="mini">
        <span class="who">{other.name}</span>
        <span class="fan" aria-hidden="true">
          {#each other.cards as card (cardKey(card))}<span class="card"><PlayingCard {card} label={false} /></span>{/each}
        </span>
        <span class="visually-hidden">{other.name}: {other.cards.map(cardName).join(", ")}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .open-hands {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
  }
  .mini {
    display: grid;
    justify-items: center;
    gap: 0.15rem;
    min-width: 0;
  }
  .who {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--color-faint);
  }
  .fan {
    display: flex;
    justify-content: center;
    --cw: 1.7rem;
    min-height: calc(var(--cw) * 1.4);
  }
  .card + .card {
    margin-left: calc(var(--cw) * -0.62);
  }
  @media (min-width: 640px) {
    .fan {
      --cw: 2.4rem;
    }
  }
</style>
