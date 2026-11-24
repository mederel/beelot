<script lang="ts">
  // My statistics (US-024, US-068, US-124): a guest is invited to sign in; a signed-in player sees the record, one panel at
  // a time (overall, by variant, by bot difficulty), the rating and its history, the contracts and the recent matches.
  import { Flame, Swords, Trophy, Target } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { apiJson, type ApiError } from "$lib/api/client";
  import { formatNumber, language, localized, playerName, t } from "$lib/i18n/i18n.svelte";
  import { ratingRows, sparklinePoints, statsPanel, type RatingRow } from "$lib/models/small";
  import { goals, goalText } from "$lib/stores/goals.svelte";
  import Segmented from "$lib/ui/Segmented.svelte";
  import Button from "$lib/ui/Button.svelte";
  import SignInPanel from "./SignInPanel.svelte";
  import ProgressTabs from "./ProgressTabs.svelte";

  let view = $state<"loading" | "guest" | "empty" | "error" | "ready">("loading");
  let stats = $state<any>(null);
  let ratings = $state<RatingRow[]>([]);
  let panel = $state<"overall" | "variant" | "difficulty">("overall");
  let signIn = $state(false);

  const labels: Record<string, string> = {
    CLASSIC: "Classic Belote",
    CONTREE: "Contrée",
    RELAXED: "Relaxed",
    CHALLENGING: "Challenging",
    SOLO: "Against bots",
    PRIVATE: "Private table",
    PUBLIC: "Public table"
  };
  const label = (key: string) => t(labels[key] ?? key);
  const percent = (value: number | null | undefined) => (value == null ? "—" : `${formatNumber(value)} %`);

  async function load() {
    view = "loading";
    try {
      stats = await apiJson("/api/statistics");
    } catch (error) {
      stats = null;
      if ((error as ApiError).status === 401) {
        view = "guest";
        return;
      }
    }
    if (!stats) {
      view = "error";
      return;
    }
    if (stats.overall.played === 0) {
      view = "empty";
      return;
    }
    view = "ready";
    try {
      ratings = ratingRows((await apiJson("/api/ratings")).ratings);
    } catch {
      // The record above is still shown; the wrapper has shown the connection note when the connection was the cause.
      ratings = ratingRows(undefined);
    }
  }

  onMount(load);

  const facts = $derived.by(() => {
    if (!stats) return [];
    const contracts = stats.contracts;
    return [
      ["Contracts taken by your team", formatNumber(contracts.taken)],
      ["Contracts made", contracts.taken === 0 ? "—" : t("{0} ({1})", formatNumber(contracts.made), percent(Math.round((100 * contracts.made) / contracts.taken)))],
      ["Coinches by your team", t("{0}, {1} defeated the contract", formatNumber(contracts.coinchesByTeam), formatNumber(contracts.coinchesByTeamWon))],
      ["Coinches against your team", t("{0}, {1} defeated your contract", formatNumber(contracts.coinchesAgainstTeam), formatNumber(contracts.coinchesAgainstTeamWon))],
      ["Capots", formatNumber(contracts.capots)],
      ["Belotes", formatNumber(contracts.belotes)],
      ["Average points per round", stats.averagePointsPerRound == null ? "—" : formatNumber(stats.averagePointsPerRound)]
    ];
  });
  const dateFormat = $derived(new Intl.DateTimeFormat(language(), { dateStyle: "medium", timeStyle: "short" }));
  const winRate = $derived(stats?.overall?.winRate ?? 0);
</script>

<div class="page stats">
  <header class="head">
    <ProgressTabs current="stats" />
    <p class="eyebrow">{t("Your progress")}</p>
    <h1 class="page-title">{t("My statistics")}</h1>
    {#if goals.ledger}<p class="goal"><Flame size={18} aria-hidden="true" />{goalText()}</p>{/if}
  </header>

  {#if view === "guest"}
    <section class="card glass" in:fly={{ y: 12, duration: 300 }}>
      <h2>{localized({ code: "sign-in-statistics" }, "Sign in to see your statistics.")}</h2>
      <p class="muted">{t("Create an account with a passkey to keep your results and see your progress here.")}</p>
      {#if signIn}<SignInPanel ondone={load} />{:else}<Button variant="secondary" onclick={() => (signIn = true)}>{t("Sign in")}</Button>{/if}
    </section>
  {:else if view === "empty"}
    <p class="card glass muted">{t("No finished matches yet. Finish a match while signed in and it will appear here.")}</p>
  {:else if view === "error"}
    <p class="card glass muted">{t("Something went wrong. Please try again.")}</p>
  {:else if view === "ready" && stats}
    <section class="overview" aria-label={t("Match record")} in:fly={{ y: 12, duration: 300 }}>
      <div class="ring glass" style:--rate={winRate}>
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="50" /><circle class="value" cx="60" cy="60" r="50" pathLength="100" /></svg>
        <span><strong class="tabular">{percent(stats.overall.winRate)}</strong><small>{t("Win rate")}</small></span>
      </div>
      <div class="tiles">
        <p class="tile glass"><Swords size={18} aria-hidden="true" /><strong class="tabular">{formatNumber(stats.overall.played)}</strong><span>{t("Matches played")}</span></p>
        <p class="tile glass"><Trophy size={18} aria-hidden="true" /><strong class="tabular">{formatNumber(stats.overall.won)}</strong><span>{t("Wins")}</span></p>
        <p class="tile glass"><Target size={18} aria-hidden="true" /><strong class="tabular">{formatNumber(stats.overall.lost)}</strong><span>{t("Losses")}</span></p>
      </div>
    </section>

    <Segmented name="stats-view" label={t("Record")} bind:value={panel} options={[{ value: "overall", label: t("Overall") }, { value: "variant", label: t("By variant") }, { value: "difficulty", label: t("By bot difficulty") }]} />

    {#if statsPanel(panel) !== "overall"}
      {@const rows = panel === "variant" ? stats.byVariant : stats.byDifficulty}
      <section class="card glass" in:fly={{ y: 8, duration: 250 }}>
        <h2>{t(panel === "variant" ? "By variant" : "Solo games by difficulty")}</h2>
        <div class="scroll">
          <table class="data-table">
            <thead><tr><th scope="col"></th><th scope="col">{t("Played")}</th><th scope="col">{t("Wins")}</th><th scope="col">{t("Losses")}</th><th scope="col">{t("Win rate")}</th></tr></thead>
            <tbody>
              {#each rows as record (record.key)}
                <tr><th scope="row">{label(record.key)}</th><td>{formatNumber(record.played)}</td><td>{formatNumber(record.won)}</td><td>{formatNumber(record.lost)}</td><td>{percent(record.winRate)}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    {#if ratings.length}
      <section class="card glass">
        <h2>{t("Rating")}</h2>
        <div class="ratings">
          {#each ratings as row (row.variant)}
            <div class="rating">
              <span class="muted">{label(row.variant)}</span>
              <strong class="tabular">{row.provisional ? t("{0} ± {1} (provisional)", formatNumber(row.rating), formatNumber(row.deviation)) : t("{0} ± {1}", formatNumber(row.rating), formatNumber(row.deviation))}</strong>
              <small class="muted">{t("Matches")}: {formatNumber(row.matches)}</small>
              {#if row.history.length > 1}
                <svg class="spark" viewBox="0 0 200 40" role="img" aria-label={t("Rating history, {0}: from {1} to {2}", label(row.variant), formatNumber(row.history[0].rating), formatNumber(row.history[row.history.length - 1].rating))}>
                  <polyline points={sparklinePoints(row.history, 200, 40)} />
                </svg>
              {/if}
            </div>
          {/each}
        </div>
        <p class="note">{t("Public matches with four human players change your rating (Glicko-2). A rating stays provisional until its uncertainty is small.")}</p>
      </section>
    {/if}

    <section class="card glass">
      <h2>{t("Contracts")}</h2>
      <dl class="facts">
        {#each facts as [term, value] (term)}<div><dt>{t(term)}</dt><dd class="tabular">{value}</dd></div>{/each}
      </dl>
    </section>

    <section class="card glass">
      <h2>{t("Recent matches")}</h2>
      <div class="scroll">
        <table class="data-table">
          <thead>
            <tr>{#each ["Date", "Mode", "Variant", "Target", "Partner", "Opponents", "Score", "Result"] as heading (heading)}<th scope="col">{t(heading)}</th>{/each}</tr>
          </thead>
          <tbody>
            {#each stats.recentMatches as match, index (index)}
              <tr>
                <th scope="row">{dateFormat.format(new Date(match.endedAt))}</th>
                <td>{match.mode === "SOLO" && match.difficulty ? t("{0} ({1})", label(match.mode), label(match.difficulty)) : label(match.mode)}</td>
                <td>{label(match.variant)}</td>
                <td>{formatNumber(match.target)}</td>
                <td>{playerName(match.partner)}</td>
                <td>{match.opponents.map(playerName).join(", ")}</td>
                <td>{formatNumber(match.teamScore)} – {formatNumber(match.opponentScore)}</td>
                <td><span class="result" class:won={match.won}>{t(match.won ? "Won" : "Lost")}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>

<style>
  .stats {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.1rem;
  }
  .head {
    display: grid;
    gap: 0.6rem;
    justify-items: start;
  }
  .goal {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    gap: 0.4rem;
    color: var(--color-honey-300);
    font-weight: 600;
  }
  .card {
    display: grid;
    gap: 0.8rem;
    padding: 1.25rem;
    border-radius: 1.5rem;
  }
  .card h2 {
    font-size: 1.2rem;
    font-weight: 700;
  }
  .muted {
    color: var(--color-muted);
  }
  .overview {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.75rem;
  }
  /* On a 320 px screen the ring and the three tiles do not fit side by side: the tiles go under the ring. */
  @media (max-width: 24rem) {
    .overview {
      grid-template-columns: minmax(0, 1fr);
    }
    .ring {
      justify-self: center;
    }
  }
  .ring {
    position: relative;
    display: grid;
    place-items: center;
    width: 9.5rem;
    aspect-ratio: 1;
    border-radius: 1.5rem;
  }
  .ring svg {
    position: absolute;
    inset: 0.75rem;
    rotate: -90deg;
  }
  .ring circle {
    fill: none;
    stroke-width: 10;
    stroke-linecap: round;
  }
  .track {
    stroke: rgb(255 255 255 / 0.08);
  }
  .value {
    stroke: var(--color-honey-500);
    stroke-dasharray: var(--rate) 100;
    filter: drop-shadow(0 0 8px rgb(255 159 28 / 0.6));
  }
  .ring span {
    display: grid;
    text-align: center;
  }
  .ring strong {
    font-family: var(--font-display);
    font-size: 1.6rem;
  }
  .ring small {
    color: var(--color-muted);
    font-size: 0.75rem;
  }
  .tiles {
    display: grid;
    gap: 0.5rem;
  }
  .tile {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.9rem;
    border-radius: 1rem;
  }
  .tile :global(svg) {
    color: var(--color-honey-400);
  }
  .tile strong {
    font-family: var(--font-display);
    font-size: 1.3rem;
  }
  .tile span {
    color: var(--color-muted);
    font-size: 0.85rem;
  }
  .scroll {
    overflow-x: auto;
    margin: 0 -0.5rem;
  }
  .ratings {
    display: grid;
    gap: 0.75rem;
  }
  @media (min-width: 720px) {
    .ratings {
      grid-template-columns: 1fr 1fr;
    }
  }
  .rating {
    display: grid;
    gap: 0.2rem;
    padding: 0.9rem;
    border-radius: 1rem;
    background: rgb(255 255 255 / 0.04);
  }
  .rating strong {
    font-family: var(--font-display);
    font-size: 1.3rem;
  }
  .spark {
    width: 100%;
    height: 3rem;
    margin-top: 0.4rem;
  }
  .spark polyline {
    fill: none;
    stroke: var(--color-violet-400);
    stroke-width: 2.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .note {
    color: var(--color-faint);
    font-size: 0.82rem;
  }
  .facts {
    display: grid;
    gap: 0.25rem;
  }
  .facts div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid rgb(255 255 255 / 0.06);
  }
  dt {
    color: var(--color-muted);
  }
  dd {
    font-weight: 650;
    text-align: right;
  }
  .result {
    padding: 0.2rem 0.6rem;
    border-radius: 99px;
    font-weight: 650;
    font-size: 0.8rem;
    color: var(--color-coral-400);
    background: rgb(255 92 122 / 0.12);
  }
  .result.won {
    color: var(--color-mint-400);
    background: rgb(79 240 189 / 0.12);
  }
</style>
