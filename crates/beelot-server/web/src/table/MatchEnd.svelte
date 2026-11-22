<script lang="ts">
  // The end of the match (US-093): the winner, the first game or win celebrated (US-113), the podium whose scores count
  // up, the recap, the rematch (US-114), the account offer (US-115), and play again, change options, home or view the table.
  import { onMount, untrack } from "svelte";
  import { Tween } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import { fly, scale } from "svelte/transition";
  import { Home, Eye, Settings2, Trophy, Repeat } from "@lucide/svelte";
  import { formatNumber, playerName, t } from "$lib/i18n/i18n.svelte";
  import { rematchTexts } from "$lib/models/moments";
  import { signInRequest } from "$lib/stores/account.svelte";
  import { navigate } from "$lib/stores/router.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import Button from "$lib/ui/Button.svelte";
  import { portal } from "$lib/ui/portal";
  import Bee from "$lib/brand/Bee.svelte";
  import type { TableGame } from "./game.svelte";

  let { game }: { game: TableGame } = $props();
  const model = $derived(game.matchEnd!);
  const first = $derived(game.matchEndAnimate ? ({ firstWin: "First win!", firstGame: "First game!" } as Record<string, string>)[model.goal?.celebration ?? ""] : undefined);
  const celebrating = $derived(game.matchEndAnimate && (model.iWon || first !== undefined));
  const rematch = $derived(rematchTexts(model.rematch ?? { state: "idle", names: [] }, t));
  const scores = untrack(() => model.podium).map((step) => new Tween(game.matchEndAnimate && settings.effects === "full" ? 0 : step.score, { duration: 1200, easing: cubicOut }));
  let playButton: HTMLElement | null = $state(null);
  let overlay: HTMLElement;

  onMount(() => {
    model.podium.forEach((step, index) => scores[index].set(step.score));
    playButton?.focus({ preventScroll: true });
    const main = document.getElementById("main");
    if (main) main.inert = true;
    return () => {
      if (main) main.inert = false;
    };
  });

  const labels: Record<string, string> = { tierce: "tierce", cinquante: "cinquante", cent: "cent", carre: "carré" };
  function createAccount() {
    game.dismissMatchEnd();
    signInRequest.open = true;
    signInRequest.signUp = true;
    navigate("/settings");
  }
</script>

<svelte:window onkeydown={(event) => event.key === "Escape" && game.dismissMatchEnd()} />

<div class="match-end" bind:this={overlay} use:portal role="dialog" aria-modal="true" aria-labelledby="match-end-title" transition:fly={{ y: settings.effects === "full" ? 40 : 0, duration: 400, opacity: 0 }}>
  <div class="content">
    <div class="trophy" class:won={celebrating} aria-hidden="true">
      {#if celebrating}<Trophy size={56} strokeWidth={1.8} />{:else}<Bee size="4rem" />{/if}
    </div>
    {#if celebrating}<p class="sticker" in:scale={{ start: 0.3, duration: 600, delay: 150 }}>{t(first ?? "Victory!")}</p>{/if}
    <h2 id="match-end-title">{t("{0} win the match!", t(model.winner))}</h2>
    {#if model.goal}<p class="goal">{model.goal.message}</p>{/if}

    <p class="eyebrow">{t("Final score")}</p>
    <div class="podium">
      {#each model.podium as step, index (step.team)}
        <div class="step" data-place={step.place} in:fly={{ y: 50, duration: 600, delay: game.matchEndAnimate ? 250 + index * 150 : 0 }}>
          <span class="names">{step.names.map(playerName).join(" · ")}</span>
          <strong class="tabular">{formatNumber(Math.round(scores[index].current))}</strong>
          <span class="place">{step.place}</span>
        </div>
      {/each}
    </div>

    <div class="recap glass">
      <p>{t("{0} rounds", model.recap.rounds)}</p>
      {#if model.recap.biggestRound}
        {@const big = model.recap.biggestRound}
        <p>{t("Biggest round: {0} points, {1}, round {2}", formatNumber(big.points), t(big.team), big.round)}</p>
      {/if}
      <p class="recap-heading">{t("Announcements")}</p>
      {#each model.recap.announcements as team (team.team)}
        <p>{t(team.team)}: {team.items.length ? team.items.map(({ kind, count }) => `${t(labels[kind])} ×${count}`).join(", ") : t("None")}</p>
      {/each}
    </div>

    {#if rematch.status}<p class="rematch" role="status">{rematch.status}</p>{/if}

    {#if model.offer}
      <section class="offer glass" aria-labelledby="offer-text">
        <p id="offer-text">{t("Keep this result: create an account with a passkey.")}</p>
        <div class="row">
          <Button size="sm" variant="secondary" onclick={createAccount}>{t("Create an account")}</Button>
          <Button size="sm" variant="ghost" onclick={() => { game.dismissOffer(); playButton?.focus({ preventScroll: true }); }}>{t("Not now")}</Button>
        </div>
      </section>
    {/if}

    <div class="actions">
      <Button bind:element={playButton} size="lg" block disabled={rematch.disabled} onclick={() => game.rematch()}><Repeat size={18} aria-hidden="true" />{rematch.label}</Button>
      <div class="row">
        {#if model.solo}<Button variant="secondary" href="/play/bot" onclick={() => game.dismissMatchEnd()}><Settings2 size={16} aria-hidden="true" />{t("Change options")}</Button>{/if}
        <Button variant="secondary" href="/" onclick={() => game.dismissMatchEnd()}><Home size={16} aria-hidden="true" />{t("Back to home")}</Button>
      </div>
      <Button variant="ghost" onclick={() => game.dismissMatchEnd()}><Eye size={16} aria-hidden="true" />{t("View table")}</Button>
    </div>
  </div>
</div>

<style>
  .match-end {
    position: fixed;
    inset: 0;
    z-index: 70;
    overflow-y: auto;
    background:
      radial-gradient(60% 40% at 50% 15%, rgb(255 194 46 / 0.25), transparent 70%),
      radial-gradient(50% 40% at 80% 90%, rgb(139 108 255 / 0.25), transparent 70%),
      rgb(7 6 15 / 0.985);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(12px);
  }
  .content {
    display: grid;
    justify-items: center;
    gap: 0.9rem;
    width: min(30rem, 100%);
    margin: 0 auto;
    padding: max(2rem, env(safe-area-inset-top)) 1.25rem max(2rem, env(safe-area-inset-bottom));
    text-align: center;
  }
  .trophy {
    display: grid;
    place-items: center;
    width: 6rem;
    height: 6rem;
    border-radius: 50%;
    color: var(--color-muted);
    background: rgb(255 255 255 / 0.06);
  }
  .trophy.won {
    color: #1b1203;
    background: linear-gradient(140deg, var(--color-honey-200), var(--color-honey-600));
    box-shadow: 0 0 0 8px rgb(255 194 46 / 0.15), 0 20px 60px -10px rgb(255 159 28 / 0.8);
  }
  :global([data-effects="full"]) .trophy.won {
    animation: float 3s ease-in-out infinite;
  }
  .sticker {
    padding: 0.3rem 1.2rem 0.4rem;
    border-radius: 1rem;
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 800;
    color: #1b1203;
    background: linear-gradient(180deg, var(--color-honey-300), var(--color-honey-600));
    rotate: -3deg;
  }
  h2 {
    font-size: clamp(1.8rem, 7vw, 2.5rem);
    font-weight: 800;
  }
  .goal {
    color: var(--color-honey-300);
    font-weight: 600;
  }
  .podium {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: end;
    gap: 0.6rem;
    width: 100%;
  }
  .step {
    position: relative;
    display: grid;
    gap: 0.3rem;
    padding: 1rem 0.6rem 1.6rem;
    border-radius: 1.3rem 1.3rem 0.6rem 0.6rem;
    background: rgb(255 255 255 / 0.06);
    border: 1px solid rgb(255 255 255 / 0.1);
  }
  .step[data-place="1"] {
    padding-top: 1.8rem;
    background: linear-gradient(180deg, rgb(255 194 46 / 0.28), rgb(255 194 46 / 0.06));
    border-color: rgb(255 194 46 / 0.45);
  }
  .names {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--color-muted);
  }
  .step strong {
    font-family: var(--font-display);
    font-size: 2.2rem;
    font-weight: 800;
  }
  .place {
    position: absolute;
    left: 50%;
    bottom: -0.8rem;
    translate: -50% 0;
    display: grid;
    place-items: center;
    width: 1.7rem;
    height: 1.7rem;
    border-radius: 50%;
    font-weight: 800;
    font-size: 0.85rem;
    color: #1b1203;
    background: #d9d4ef;
  }
  [data-place="1"] .place {
    background: var(--color-honey-400);
  }
  .recap {
    width: 100%;
    margin-top: 0.6rem;
    padding: 0.9rem 1rem;
    border-radius: 1.2rem;
    font-size: 0.88rem;
    color: var(--color-muted);
    text-align: left;
  }
  .recap-heading {
    margin-top: 0.4rem;
    font-weight: 700;
    color: var(--color-ink);
  }
  .rematch {
    color: var(--color-honey-300);
    font-weight: 600;
  }
  .offer {
    display: grid;
    gap: 0.6rem;
    width: 100%;
    padding: 1rem;
    border-radius: 1.2rem;
  }
  .actions {
    display: grid;
    gap: 0.5rem;
    width: 100%;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.45rem;
  }
  .row :global(.btn) {
    flex: 1 1 9rem;
  }
</style>
