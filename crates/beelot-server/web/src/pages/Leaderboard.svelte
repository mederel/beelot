<script lang="ts">
  // The leaderboard (US-069): the top 50 of a variant with the viewer's own place, and the daily deal's board (US-150).
  import { Crown, CalendarDays } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { apiJson } from "$lib/api/client";
  import { formatNumber, t } from "$lib/i18n/i18n.svelte";
  import { dailyMineNote, isMineListed, mineNote, type DailyInfo } from "$lib/models/small";
  import Segmented from "$lib/ui/Segmented.svelte";
  import ProgressTabs from "./ProgressTabs.svelte";

  let variant = $state<"CLASSIC" | "CONTREE">("CLASSIC");
  let board = $state<any>(null);
  let failed = $state(false);
  let day = $state<"today" | "yesterday">("today");
  let daily = $state<DailyInfo | null>(null);
  let dailyKnown = $state(false);

  async function loadBoard() {
    failed = false;
    const response = await fetch(`/api/leaderboard?variant=${variant}`).catch(() => null);
    board = response?.ok ? await response.json().catch(() => null) : null;
    failed = !board;
  }

  async function loadDaily() {
    try {
      daily = await apiJson<DailyInfo>(`/api/daily?day=${day}`);
    } catch {
      daily = null;
    }
    dailyKnown = true;
  }

  onMount(() => {
    loadBoard();
    loadDaily();
  });

  const note = $derived(board ? mineNote(board.mine, board.minMatches) : null);
  const dailyNote = $derived(daily ? dailyMineNote(daily.mine) : null);
</script>

<div class="page board">
  <header class="head">
    <ProgressTabs current="leaderboard" />
    <p class="eyebrow">{t("Compare yourself")}</p>
    <h1 class="page-title">{t("Leaderboard")}</h1>
  </header>

  <Segmented name="board-variant" label={t("Variant")} bind:value={variant} onchange={loadBoard} options={[{ value: "CLASSIC", label: t("Classic Belote") }, { value: "CONTREE", label: t("Contrée") }]} />

  {#if note}<p class="mine" role="status">{t(note.text, ...note.values.map((value) => formatNumber(value)))}</p>{/if}
  {#if failed}
    <p class="muted">{t("Something went wrong. Please try again.")}</p>
  {:else if board && board.rows.length === 0}
    <p class="muted">{t("Nobody is listed yet. Players appear after ten rated matches in public games.")}</p>
  {:else if board}
    <ol class="ranks glass">
      {#each board.rows as row (row.rank)}
        {@const mine = isMineListed(board.rows, board.mine) && row.rank === board.mine.rank}
        <li class:mine class:podium={row.rank <= 3} data-rank={row.rank}>
          <span class="rank tabular">{#if row.rank === 1}<Crown size={18} aria-hidden="true" />{:else}{formatNumber(row.rank)}{/if}</span>
          <span class="name">{row.name}</span>
          <span class="rating tabular">{formatNumber(row.rating)}</span>
          <small class="tabular">{t("{0} matches", formatNumber(row.matches))}</small>
        </li>
      {/each}
    </ol>
  {/if}
  <p class="note">{t("The top 50 players of the variant, rated with Glicko-2 from public matches with four human players. Players need at least ten rated matches to be listed.")}</p>

  {#if dailyKnown && daily}
    <section class="daily glass">
      <h2><CalendarDays size={20} aria-hidden="true" />{t("Daily deal")}</h2>
      <Segmented name="daily-day" label={t("Day")} size="sm" bind:value={day} onchange={loadDaily} options={[{ value: "today", label: t("Today") }, { value: "yesterday", label: t("Yesterday") }]} />
      {#if dailyNote}<p class="mine" role="status">{t(dailyNote.text, ...dailyNote.values.map((value) => formatNumber(value)))}</p>{/if}
      {#if daily.rows.length === 0}
        <p class="muted">{t("No score yet for this day.")}</p>
      {:else}
        <table class="data-table">
          <thead><tr><th scope="col">#</th><th scope="col">{t("Player")}</th><th scope="col">{t("Score")}</th></tr></thead>
          <tbody>
            {#each daily.rows as row (row.rank)}<tr><th scope="row">{formatNumber(row.rank)}</th><td>{row.name}</td><td>{formatNumber(row.score)}</td></tr>{/each}
          </tbody>
        </table>
      {/if}
      <p class="note">{t("The same deal for everyone, one try a day for signed-in players. Guests can play it but are not ranked.")}</p>
    </section>
  {/if}
</div>

<style>
  .board {
    display: grid;
    gap: 1rem;
  }
  .head {
    display: grid;
    gap: 0.6rem;
    justify-items: start;
  }
  .muted {
    color: var(--color-muted);
  }
  .mine {
    padding: 0.7rem 1rem;
    border-radius: 1rem;
    color: var(--color-honey-200);
    background: rgb(255 159 28 / 0.1);
    border: 1px solid rgb(255 159 28 / 0.25);
    font-weight: 600;
  }
  .ranks {
    list-style: none;
    padding: 0.4rem;
    border-radius: 1.5rem;
  }
  .ranks li {
    display: grid;
    grid-template-columns: 2.5rem 1fr auto;
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 0.75rem;
    padding: 0.7rem 0.75rem;
    border-radius: 1rem;
  }
  .ranks li + li {
    border-top: 1px solid rgb(255 255 255 / 0.05);
  }
  .ranks li.mine {
    background: rgb(255 194 46 / 0.12);
    box-shadow: inset 0 0 0 1px rgb(255 194 46 / 0.4);
  }
  .rank {
    grid-row: span 2;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.75rem;
    font-weight: 750;
    background: rgb(255 255 255 / 0.06);
  }
  .podium .rank {
    color: #1b1203;
    background: linear-gradient(140deg, var(--color-honey-300), var(--color-honey-600));
  }
  [data-rank="2"] .rank {
    background: linear-gradient(140deg, #f0f0f6, #a9a9bd);
  }
  [data-rank="3"] .rank {
    background: linear-gradient(140deg, #f5c9a1, #b8743d);
  }
  .name {
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rating {
    grid-row: span 2;
    font-family: var(--font-display);
    font-weight: 750;
    font-size: 1.15rem;
  }
  .ranks small {
    color: var(--color-faint);
  }
  .note {
    color: var(--color-faint);
    font-size: 0.82rem;
  }
  .daily {
    display: grid;
    gap: 0.8rem;
    padding: 1.25rem;
    border-radius: 1.5rem;
  }
  .daily h2 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.2rem;
  }
</style>
