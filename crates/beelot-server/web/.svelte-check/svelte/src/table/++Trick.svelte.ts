///<reference types="svelte" />
;// The trick in the middle of the table: each card arrives from where it was played (the tapped card of the hand, or a
// player's seat, turning from its back to its face on the way), rests at a slight angle, the winning card glows with its
// points, and the trick is gathered to its winner before the next one (US-089, US-119).

import { scale } from "svelte/transition";
import { playerName, t } from "$lib/i18n/i18n.svelte";
import { restAngle } from "$lib/models/card-physics";
import { boxOf, centre } from "$lib/fx/flight";
import { paced, settings } from "$lib/stores/settings.svelte";
import PlayingCard from "$lib/cards/PlayingCard.svelte";
import CardBack from "$lib/cards/CardBack.svelte";
import type { TableGame, TrickCard } from "./game.svelte";

;type $$ComponentProps =  { game: TableGame };function $$render() {

  
  
  
  
  
  
  
  
  
  
  

  let { game }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();

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
;
async () => {

 { svelteHTML.createElement("div", {  "class":`trick`,});!game.trick.length;
  if(game.collecting){
    game.collecting.key; {
         for(let item of __sveltets_2_ensureArray(game.collecting.cards)){item.key;
         { svelteHTML.createElement("div", {    "class":`slot ${game.placement(item.seat)}`,"aria-hidden":`true`,});__sveltets_2_ensureType(String, Number, `${restAngle(item.card)} `);
           {const $$action_0 = __sveltets_2_ensureAction(gather(svelteHTML.mapElementTag('div'),(game.collecting.to)));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {   "class":`card`,}); { const $$_draCgniyalP3C = __sveltets_2_ensureComponent(PlayingCard); new $$_draCgniyalP3C({ target: __sveltets_2_any(), props: {    "card":item.card,"label":false,}});} }}
         }
      }
    }
  }
     for(let item of __sveltets_2_ensureArray(game.trick)){item.key;
    const placement = game.placement(item.seat);
     { svelteHTML.createElement("div", {   "class":`slot ${placement}`,});game.trickWinner === item.seat;__sveltets_2_ensureType(String, Number, `${restAngle(item.card)} `);
       {const $$action_0 = __sveltets_2_ensureAction(arrive(svelteHTML.mapElementTag('div'),(item)));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {   "class":`card`,});
         { svelteHTML.createElement("div", { "class":`flip`,});
           { svelteHTML.createElement("div", { "class":`side face`,}); { const $$_draCgniyalP5C = __sveltets_2_ensureComponent(PlayingCard); new $$_draCgniyalP5C({ target: __sveltets_2_any(), props: {  "card":item.card,}});} }
           { svelteHTML.createElement("div", { "class":`side back`,}); { const $$_kcaBdraC5C = __sveltets_2_ensureComponent(CardBack); new $$_kcaBdraC5C({ target: __sveltets_2_any(), props: {}});} }
         }
       }}
       { svelteHTML.createElement("small", { "class":`who`,});playerName(game.seats[item.seat]?.name); }
      if(game.trickWinner === item.seat){
         { svelteHTML.createElement("strong", {       "class":`points`,"role":`status`,"aria-label":t("{0} wins the trick for {1} points", playerName(game.seats[item.seat]?.name), game.trickPoints),});__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('strong'),({ start: 0.4, duration: 380 })));t("+{0} pts", game.trickPoints); }
      }
     }
  }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Trick__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Trick__SvelteComponent_ = ReturnType<typeof Trick__SvelteComponent_>;
/*Ωignore_endΩ*/export default Trick__SvelteComponent_;