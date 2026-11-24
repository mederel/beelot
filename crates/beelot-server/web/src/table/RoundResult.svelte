<script lang="ts">
  // The round's result: contract made or failed (or the match's winner), each team's points, the breakdown, and the next
  // round, the results of a finished match, or the review of the round (US-066).
  import { ArrowRight, ChevronDown, History, Trophy } from "@lucide/svelte";
  import { fly, slide } from "svelte/transition";
  import { formatNumber, t } from "$lib/i18n/i18n.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import Button from "$lib/ui/Button.svelte";
  import type { TableGame } from "./game.svelte";

  let { game }: { game: TableGame } = $props();
  const round = $derived(game.round!);
  let details = $state(false);
  const myTeam = $derived(game.viewer % 2);
</script>

<section class="result glass" class:made={round.made} aria-labelledby="round-title" in:fly={{ y: settings.effects === "full" ? 60 : 0, duration: 420 }}>
  <h2 id="round-title">{round.title}</h2>
  <div class="teams">
    <div class="team" class:mine={myTeam === 0}><small>{t(myTeam === 0 ? "Us" : "Them")}</small><strong class="tabular">+{formatNumber(round.northSouth)}</strong></div>
    <div class="team" class:mine={myTeam === 1}><small>{t(myTeam === 1 ? "Us" : "Them")}</small><strong class="tabular">+{formatNumber(round.eastWest)}</strong></div>
  </div>
  <button class="details-toggle" type="button" aria-expanded={details} onclick={() => (details = !details)}>{t("Details")} <ChevronDown size={16} aria-hidden="true" class={details ? "open" : ""} /></button>
  {#if details}<p class="breakdown" transition:slide={{ duration: 220 }}>{round.breakdown}</p>{/if}
  <p class="visually-hidden">{round.breakdown}</p>
  <div class="actions">
    {#if round.next}<Button size="lg" onclick={() => game.nextRound()}>{t("Deal next round")} <ArrowRight size={18} aria-hidden="true" /></Button>{/if}
    {#if round.results}<Button size="lg" onclick={() => game.reopenMatchEnd()}><Trophy size={18} aria-hidden="true" />{t("Results")}</Button>{/if}
    {#if round.review}<Button variant="secondary" onclick={() => game.openReview()}><History size={18} aria-hidden="true" />{t("Review round")}</Button>{/if}
  </div>
</section>

<style>
  .result {
    position: absolute;
    z-index: 15;
    left: 50%;
    top: 50%;
    translate: -50% -55%;
    width: min(24rem, calc(100% - 1.5rem));
    display: grid;
    gap: 0.8rem;
    padding: 1.25rem;
    border-radius: 1.6rem;
    text-align: center;
    /* Opaque: the last trick is still on the felt behind the panel and must not show through the text. */
    background: linear-gradient(180deg, rgb(32 28 66), rgb(17 15 36));
  }
  h2 {
    font-size: 1.6rem;
    font-weight: 800;
    color: var(--color-coral-400);
  }
  .made h2 {
    color: var(--color-mint-400);
  }
  .teams {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .team {
    display: grid;
    padding: 0.6rem;
    border-radius: 1rem;
    background: rgb(255 255 255 / 0.05);
    --team: var(--color-violet-400);
  }
  .team.mine {
    --team: var(--color-honey-400);
    background: rgb(255 194 46 / 0.1);
  }
  .team small {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--team);
  }
  .team strong {
    font-family: var(--font-display);
    font-size: 1.8rem;
    font-weight: 800;
  }
  .details-toggle {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    justify-self: center;
    gap: 0.3rem;
    font-size: 0.85rem;
    font-weight: 650;
    color: var(--color-muted);
  }
  .details-toggle :global(svg) {
    transition: rotate 0.3s;
  }
  .details-toggle :global(svg.open) {
    rotate: 180deg;
  }
  .breakdown {
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--color-muted);
    text-align: left;
  }
  .actions {
    display: grid;
    gap: 0.45rem;
  }
</style>
