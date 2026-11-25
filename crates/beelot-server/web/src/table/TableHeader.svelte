<script lang="ts">
  // The table's header (US-106): the menu (hint, help, leave), the one status line, Undo (US-146), the spectators (US-071)
  // and the score of each team with the target and their progress (US-091, US-109). A rising score counts up.
  import { Eye, HelpCircle, Lightbulb, LogOut, Menu, Undo2 } from "@lucide/svelte";
  import { fly, scale } from "svelte/transition";
  import { Tween } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import { formatNumber, t } from "$lib/i18n/i18n.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import SuitText from "$lib/ui/SuitText.svelte";
  import type { TableGame } from "./game.svelte";

  let { game, onRules }: { game: TableGame; onRules: () => void } = $props();
  let menu = $state(false);
  let menuButton: HTMLButtonElement;

  const duration = () => (settings.effects === "full" ? 700 : 0);
  const ns = new Tween(0, { duration: 0, easing: cubicOut });
  const ew = new Tween(0, { duration: 0, easing: cubicOut });
  let first = true;
  $effect(() => {
    const model = game.score;
    if (!model) return;
    const [north, east] = model.teams;
    const options = { duration: first ? 0 : duration() };
    ns.set(north.matchScore, north.matchScore >= ns.current ? options : { duration: 0 });
    ew.set(east.matchScore, east.matchScore >= ew.current ? options : { duration: 0 });
    first = false;
  });

  function closeMenu(focus = false) {
    menu = false;
    if (focus) menuButton?.focus();
  }

  function outside(event: MouseEvent) {
    if (menu && !(event.target as Element).closest(".menu-wrap")) closeMenu();
  }
</script>

<svelte:window onclick={outside} onkeydown={(event) => event.key === "Escape" && menu && closeMenu(true)} />

<div class="top">
<header class="header">
  <div class="menu-wrap">
    <button bind:this={menuButton} class="icon-button" type="button" aria-controls="table-menu" aria-expanded={menu} aria-label={t("Menu")} onclick={() => (menu = !menu)}>
      <Menu size={20} strokeWidth={2.4} aria-hidden="true" />
    </button>
    {#if menu}
      <div class="menu glass" id="table-menu" transition:scale={{ start: 0.92, duration: 180 }}>
        <p class="menu-title">{game.menuGame}</p>
        {#if game.hintAvailable}
          <button type="button" onclick={() => { closeMenu(true); game.askHint(); }}><Lightbulb size={18} aria-hidden="true" />{t("Hint")}</button>
        {/if}
        <button type="button" onclick={() => { closeMenu(); onRules(); }}><HelpCircle size={18} aria-hidden="true" />{t("Help")}</button>
        <a href={game.exitPath} data-confirm-leave onclick={() => closeMenu()}><LogOut size={18} aria-hidden="true" />{t("Leave table")}</a>
      </div>
    {/if}
  </div>

  {#if game.score}
    {@const [north, east] = game.score.teams}
    <div class="scores" role="group" aria-label={t("Score")}>
      <div class="team" class:mine={north.mine} data-team="0">
        <span class="team-name">{t(north.mine ? "Us" : east.mine ? "Them" : "North–South")}</span>
        <strong class="tabular" aria-hidden={ns.current !== north.matchScore || undefined}>{formatNumber(Math.round(ns.current))}</strong>
        {#if north.roundPoints != null}<small class="tabular">+{formatNumber(north.roundPoints)}</small>{/if}
        <span class="bar" aria-hidden="true"><i style:--progress={north.progress}></i></span>
      </div>
      <span class="target tabular">{t("to {0}", formatNumber(game.score.target))}</span>
      <div class="team" class:mine={east.mine} data-team="1">
        <span class="team-name">{t(east.mine ? "Us" : north.mine ? "Them" : "East–West")}</span>
        <strong class="tabular" aria-hidden={ew.current !== east.matchScore || undefined}>{formatNumber(Math.round(ew.current))}</strong>
        {#if east.roundPoints != null}<small class="tabular">+{formatNumber(east.roundPoints)}</small>{/if}
        <span class="bar" aria-hidden="true"><i style:--progress={east.progress}></i></span>
      </div>
    </div>
  {:else}
    <div class="scores placeholder"><span class="game-title">{game.title}</span></div>
  {/if}

  {#if game.hintAvailable}
    <button class="icon-button hint" type="button" aria-label={t("Hint")} onclick={() => game.askHint()} transition:scale={{ duration: 200 }}>
      <Lightbulb size={20} strokeWidth={2.4} aria-hidden="true" />
    </button>
  {:else}
    <span class="icon-spacer" aria-hidden="true"></span>
  {/if}
</header>

<div class="status-row">
  <p class="status" class:flash={game.statusFlash} role="status">
    {#key game.status}<span in:fly={{ y: 6, duration: 200 }}><SuitText text={game.status} /></span>{/key}
  </p>
  {#if game.undo}
    <button class="undo" type="button" onclick={() => game.takeBack()} transition:scale={{ duration: 200 }}><Undo2 size={16} aria-hidden="true" />{t("Undo ({0} left)", game.undo.left)}</button>
  {/if}
  {#if game.watchers}
    <p class="watchers" role="status"><Eye size={14} aria-hidden="true" />{game.watchers}</p>
  {/if}
</div>
</div>

<style>
  .top {
    position: relative;
    z-index: 25;
    width: 100%;
    max-width: 52rem;
    margin: 0 auto;
  }
  .header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.5rem;
  }
  /* The account button is fixed at the top right of every page, the table included (US-200): on a landscape phone or a tablet the
     header leaves it room beside the hint (10 rem: the guest pill in French or Dutch is 9 rem wide), up to the width (67 rem) where the centred 52 rem header leaves the corner free
     (a 1024 px tablet needs it). A narrow portrait screen has no room for both (see e2e/key-screens.spec.ts). */
  @media (min-width: 37.5rem) and (max-width: 67rem) {
    .header {
      padding-right: 10rem;
    }
  }
  .menu-wrap {
    position: relative;
  }
  .icon-button,
  .icon-spacer {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.95rem;
  }
  .icon-button {
    color: var(--color-ink);
    background: rgb(255 255 255 / 0.08);
    border: 1px solid rgb(255 255 255 / 0.1);
    transition: transform 0.4s var(--ease-spring), background 0.2s;
  }
  .icon-button:active {
    transform: scale(0.9);
  }
  .icon-button.hint {
    color: #1b1203;
    background: linear-gradient(180deg, var(--color-honey-300), var(--color-honey-500));
    border: 0;
    box-shadow: 0 6px 18px -6px rgb(255 159 28 / 0.8);
  }
  .menu {
    position: absolute;
    z-index: 50;
    top: calc(100% + 0.4rem);
    left: 0;
    display: grid;
    min-width: 14rem;
    padding: 0.4rem;
    border-radius: 1.1rem;
    background: rgb(20 17 40 / 0.95);
    transform-origin: top left;
  }
  .menu-title {
    padding: 0.5rem 0.75rem 0.4rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-faint);
  }
  .menu button,
  .menu a {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-height: 2.75rem;
    padding: 0 0.75rem;
    border-radius: 0.8rem;
    color: var(--color-ink);
    font-weight: 600;
    text-decoration: none;
    text-align: left;
  }
  .menu button:hover,
  .menu a:hover {
    background: rgb(255 255 255 / 0.08);
  }
  .menu a {
    color: var(--color-coral-400);
  }
  .scores {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }
  .placeholder {
    display: flex;
    justify-content: center;
  }
  .game-title {
    font-family: var(--font-display);
    font-weight: 700;
  }
  .team {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: "name points" "score points" "bar bar";
    align-items: center;
    column-gap: 0.3rem;
    padding: 0.35rem 0.6rem 0.45rem;
    border-radius: 0.95rem;
    background: rgb(255 255 255 / 0.06);
    border: 1px solid rgb(255 255 255 / 0.08);
    min-width: 0;
    --team: var(--color-violet-400);
  }
  .team.mine {
    --team: var(--color-honey-400);
    background: rgb(255 194 46 / 0.1);
    border-color: rgb(255 194 46 / 0.35);
  }
  .team-name {
    grid-area: name;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--team);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .team strong {
    grid-area: score;
    font-family: var(--font-display);
    font-size: 1.3rem;
    font-weight: 800;
    line-height: 1;
  }
  .team small {
    grid-area: points;
    align-self: end;
    padding: 0.1rem 0.35rem;
    border-radius: 0.5rem;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--team);
    background: rgb(0 0 0 / 0.2);
  }
  .bar {
    grid-area: bar;
    height: 0.22rem;
    margin-top: 0.3rem;
    border-radius: 99px;
    background: rgb(255 255 255 / 0.08);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    width: calc(var(--progress) * 100%);
    border-radius: inherit;
    background: var(--team);
    transition: width 0.8s var(--ease-out-expo);
  }
  .target {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--color-faint);
    white-space: nowrap;
  }
  .status-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2rem;
    margin-top: 0.35rem;
  }
  .status {
    padding: 0.3rem 0.85rem;
    border-radius: 99px;
    font-size: 0.85rem;
    font-weight: 650;
    color: var(--color-ink);
    background: rgb(0 0 0 / 0.25);
    border: 1px solid rgb(255 255 255 / 0.06);
    text-align: center;
  }
  .status:empty {
    display: none;
  }
  .status.flash {
    color: #1b1203;
    background: var(--color-honey-400);
  }
  .undo {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 2rem;
    padding: 0 0.8rem;
    border-radius: 99px;
    font-size: 0.8rem;
    font-weight: 700;
    color: #1b1203;
    background: linear-gradient(180deg, var(--color-honey-300), var(--color-honey-500));
  }
  .watchers {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.75rem;
    color: var(--color-muted);
  }
</style>
