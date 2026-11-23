///<reference types="svelte" />
;// The review of the round that just ended (US-066): step through the tricks from the deal, with every hand as it was;
// the costly cards of a solo player (US-067) and why the bots played theirs (US-149).

import { onMount } from "svelte";
import { ChevronLeft, ChevronRight, X } from "@lucide/svelte";
import { fly } from "svelte/transition";
import { cardName, playerName, t } from "$lib/i18n/i18n.svelte";
import { roundReviewModel } from "$lib/models/moments";
import { costlyAtStep, costlySummary, explanationsAtStep } from "$lib/models/small";
import { cardKey } from "$lib/models/card-physics";
import PlayingCard from "$lib/cards/PlayingCard.svelte";
import Button from "$lib/ui/Button.svelte";
import { portal } from "$lib/ui/portal";
import { HINT_REASONS, PLACEMENTS, type TableGame } from "./game.svelte";

;type $$ComponentProps =  { game: TableGame };function $$render() {

  
  
  
  
  
  
  
  
  
  
  
  
  

  let { game }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
  const board = $derived(game.snapshot!.board!);
  let step = $state(0);
  let open = $state<string[]>([]);
  let nextButton: HTMLElement | null = $state(null);
  const model = $derived(roundReviewModel({ review: board.roundResult!.review, step })!);
  const placement = (seat: number) => PLACEMENTS[(seat - board.currentPlayerIndex + 4) % 4];
  const reasons = $derived(explanationsAtStep(game.review?.explanations, model.step, HINT_REASONS));
  const costly = $derived(costlyAtStep(game.review?.analysis, model.step));
  const costlyKeys = $derived(new Set(costly.map((entry: any) => `${entry.position}`)));
  const summary = $derived(model.step === 0 ? costlySummary(game.review?.analysis) : null);

  function go(by: number) {
    step = Math.min(model.steps, Math.max(0, model.step + by));
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") go(1);
    else if (event.key === "ArrowLeft") go(-1);
    else if (event.key === "Escape") game.closeReview();
  }

  onMount(() => {
    nextButton?.focus({ preventScroll: true });
    const main = document.getElementById("main");
    if (main) main.inert = true;
    return () => {
      if (main) main.inert = false;
    };
  });
;
async () => {

 { svelteHTML.createElement("svelte:window", {  "onkeydown":keydown,});}

 {const $$action_0 = __sveltets_2_ensureAction(portal(svelteHTML.mapElementTag('div')));{ svelteHTML.createElement("div", __sveltets_2_union($$action_0), {         "class":`review`,"role":`dialog`,"aria-modal":`true`,"aria-labelledby":`review-title`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: 40, duration: 320, opacity: 0 })));
   { svelteHTML.createElement("header", {});
     { svelteHTML.createElement("h2", { "id":`review-title`,});t("Review round"); }
     { svelteHTML.createElement("button", {       "class":`close`,"type":`button`,"aria-label":t("Back to result"),"onclick":() => game.closeReview(),}); { const $$_X3C = __sveltets_2_ensureComponent(X); new $$_X3C({ target: __sveltets_2_any(), props: {    "size":20,"aria-hidden":`true`,}});} }
   }
   { svelteHTML.createElement("div", { "class":`board`,});
        for(let cards of __sveltets_2_ensureArray(model.hands)){let seat = 1;seat;
       { svelteHTML.createElement("div", {  "class":`hand ${placement(seat)}`,});seat === model.winner;
         { svelteHTML.createElement("small", {});playerName(board.seats[seat].name); }
         { svelteHTML.createElement("div", { "class":`cards`,});   for(let card of __sveltets_2_ensureArray(cards)){cardKey(card); { const $$_draCgniyalP4C = __sveltets_2_ensureComponent(PlayingCard); new $$_draCgniyalP4C({ target: __sveltets_2_any(), props: { card,}});}} }
       }
    }
     { svelteHTML.createElement("div", { "class":`trick`,});
          for(let { seat, card } of __sveltets_2_ensureArray(model.trick)){let position = 1;cardKey(card);
         { svelteHTML.createElement("div", {   "class":`slot ${placement(seat)}`,});seat === model.winner;costlyKeys.has(String(position));
           { const $$_draCgniyalP4C = __sveltets_2_ensureComponent(PlayingCard); new $$_draCgniyalP4C({ target: __sveltets_2_any(), props: { card,}});}
          if(reasons.has(position)){
            const key = `${model.step}:${position}`;
             { svelteHTML.createElement("button", {       "class":`why`,"type":`button`,"aria-expanded":open.includes(key),"onclick":() => (open = open.includes(key) ? open.filter((item) => item !== key) : [...open, key]),});t(open.includes(key) ? "Hide reason" : "Why?"); }
            if(open.includes(key)){ { svelteHTML.createElement("small", { "class":`why-text`,});t(HINT_REASONS[reasons.get(position)!]); }}
          }
         }
      }
     }
   }
   { svelteHTML.createElement("p", {     "class":`status`,"role":`status`,"aria-live":`polite`,});
    model.step === 0 ? t("Deal") : `${t("Trick {0} of {1}", model.step, model.steps)} · ${t("{0} wins the trick", playerName(board.seats[model.winner ?? 0].name))}`;
   }
  if(summary || costly.length){
     { svelteHTML.createElement("p", {     "class":`costly`,"role":`status`,"aria-live":`polite`,});
      if(summary){t(summary.text, ...summary.values);}else{costly.map((entry: any) => t("Your {0} cost your team {1} points; the {2} was better.", cardName(entry.played), entry.pointsLost, cardName(entry.best))).join(" ");}
     }
  }
   { svelteHTML.createElement("div", { "class":`actions`,});
     { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"disabled":model.step === 0,"onclick":() => go(-1),}}); { const $$_tfeLnorvehC3C = __sveltets_2_ensureComponent(ChevronLeft); new $$_tfeLnorvehC3C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}t("Previous"); Button}
     { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); const $$_nottuB2 = new $$_nottuB2C({ target: __sveltets_2_any(), props: {      children:() => { return __sveltets_2_any(0); },element:nextButton,"disabled":model.step === model.steps,"onclick":() => go(1),}});/*Ωignore_startΩ*/() => nextButton = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_nottuB2.$$bindings = 'element';t("Next"); { const $$_thgiRnorvehC3C = __sveltets_2_ensureComponent(ChevronRight); new $$_thgiRnorvehC3C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});} Button}
   }
   { const $$_nottuB1C = __sveltets_2_ensureComponent(Button); new $$_nottuB1C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"variant":`ghost`,"onclick":() => game.closeReview(),}});t("Back to result"); Button}
 }}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const RoundReview__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type RoundReview__SvelteComponent_ = ReturnType<typeof RoundReview__SvelteComponent_>;
/*Ωignore_endΩ*/export default RoundReview__SvelteComponent_;