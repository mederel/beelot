<script lang="ts">
  // The trick in the middle of the table: each card arrives from where it was played (the tapped card of the hand, or a
  // player's seat, turning from its back to its face on the way), rests at a slight angle, the winning card glows with its
  // points, and the trick is gathered to its winner before the next one (US-089, US-119).
  import { scale } from "$lib/ui/motion";
  import { playerName, t } from "$lib/i18n/i18n.svelte";
  import { restAngle } from "$lib/models/card-physics";
  import { boxOf, centre } from "$lib/fx/flight";
  import { paced, settings } from "$lib/stores/settings.svelte";
  import PlayingCard from "$lib/cards/PlayingCard.svelte";
  import CardBack from "$lib/cards/CardBack.svelte";
  import type { TableGame, TrickCard } from "./game.svelte";

  let { game }: { game: TableGame } = $props();

  // Flies a card in from its origin. Measured on the slot, since the card itself is about to move.
  function arrive(node: HTMLElement, item: TrickCard) {
    if (!item.fly || settings.effects === "off") return;
    const self = item.seat === game.viewer;
    const origin = self ? (game.takeOrigin(item.key) ?? boxOf(game.anchors.hand)) : boxOf(game.anchors.seats.get(item.seat));
    const slot = boxOf(node);
    const inner = node.querySelector(".flip") as HTMLElement | null;
    if (settings.effects === "reduced" || !origin || !slot) {
      node.animate({ opacity: [0, 1] }, { duration: 200 });
      return;
    }
    const from = centre(origin);
    const to = centre(slot);
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const lift = Math.min(70, Math.hypot(dx, dy) * 0.2);
    const turn = self ? 0 : (dx > 0 ? 1 : -1) * 25;
    const duration = Math.max(380, paced("trickReveal") * 0.75);
    node.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(${turn}deg) scale(${self ? 1.1 : 0.6})` },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) rotate(${turn * 0.4}deg) scale(1.08)`, offset: 0.55 },
        { transform: "translate(0, 0) rotate(0deg) scale(0.96)", offset: 0.85 },
        { transform: "none" }
      ],
      { duration, easing: "cubic-bezier(.25,.8,.35,1)" }
    );
    if (!self && inner) inner.animate([{ transform: "rotateY(180deg)" }, { transform: "rotateY(180deg)", offset: 0.25 }, { transform: "rotateY(0deg)" }], { duration: duration * 0.8, easing: "ease-in-out" });
  }

  // The gathered trick flies to its winner's seat on a layer of its own, then is gone.
  function gather(node: HTMLElement, to: number) {
    const goal = boxOf(game.anchors.seats.get(to)) ?? (to === game.viewer ? boxOf(game.anchors.hand) : null);
    const box = boxOf(node);
    if (!goal || !box) return;
    const from = centre(box);
    const end = centre(goal);
    node.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${end.x - from.x}px, ${end.y - from.y}px) scale(0.3) rotate(20deg)`, opacity: 0 }], {
      duration: paced("trickCollect"),
      easing: "cubic-bezier(.5,0,.75,0)",
      fill: "forwards"
    });
  }
</script>

<div class="trick" class:empty={!game.trick.length}>
  {#if game.collecting}
    {#key game.collecting.key}
      {#each game.collecting.cards as item (item.key)}
        <div class="slot {game.placement(item.seat)}" style:--rest="{restAngle(item.card)}deg" aria-hidden="true">
          <div class="card" use:gather={game.collecting.to}><PlayingCard card={item.card} label={false} /></div>
        </div>
      {/each}
    {/key}
  {/if}
  {#each game.trick as item (item.key)}
    {@const placement = game.placement(item.seat)}
    <div class="slot {placement}" class:winner={game.trickWinner === item.seat} style:--rest="{restAngle(item.card)}deg">
      <div class="card" use:arrive={item}>
        <div class="flip">
          <div class="side face"><PlayingCard card={item.card} /></div>
          <div class="side back"><CardBack /></div>
        </div>
      </div>
      <small class="who">{playerName(game.seats[item.seat]?.name)}</small>
      {#if game.trickWinner === item.seat}
        <strong class="points" role="status" aria-label={t("{0} wins the trick for {1} points", playerName(game.seats[item.seat]?.name), game.trickPoints)} in:scale={{ start: 0.4, duration: 380 }}>{t("+{0} pts", game.trickPoints)}</strong>
      {/if}
    </div>
  {/each}
</div>

<style>
  .trick {
    position: absolute;
    inset: 0;
    --cw: var(--trick-cw);
  }
  .slot {
    position: absolute;
    left: 50%;
    top: 50%;
    display: grid;
    justify-items: center;
    width: var(--cw);
  }
  .slot.bottom {
    translate: -50% -14%;
  }
  .slot.top {
    translate: -50% -96%;
  }
  .slot.left {
    translate: -138% -55%;
  }
  .slot.right {
    translate: 38% -55%;
  }
  .card {
    rotate: var(--rest);
    perspective: 700px;
    transition: scale 0.35s var(--ease-spring), filter 0.3s;
  }
  .flip {
    position: relative;
    transform-style: preserve-3d;
  }
  .side {
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }
  .back {
    position: absolute;
    inset: 0;
    transform: rotateY(180deg);
  }
  .winner .card {
    scale: 1.1;
    filter: drop-shadow(0 0 14px color-mix(in srgb, var(--table-accent, #ffc22e) 85%, transparent));
    z-index: 2;
  }
  .winner {
    z-index: 2;
  }
  .who {
    margin-top: 0.15rem;
    padding: 0.05rem 0.4rem;
    border-radius: 99px;
    font-size: 0.6rem;
    font-weight: 700;
    color: rgb(255 255 255 / 0.75);
    background: rgb(0 0 0 / 0.3);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .points {
    position: absolute;
    top: -0.9rem;
    padding: 0.15rem 0.55rem;
    border-radius: 99px;
    font-size: 0.78rem;
    font-weight: 800;
    color: #1b1203;
    background: linear-gradient(180deg, var(--color-honey-300), var(--color-honey-500));
    box-shadow: 0 6px 16px -4px rgb(255 159 28 / 0.8);
    white-space: nowrap;
    z-index: 3;
  }
</style>
