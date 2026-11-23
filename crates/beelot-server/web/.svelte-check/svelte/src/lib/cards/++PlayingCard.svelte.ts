///<reference types="svelte" />
;// A card face of the redesigned deck (US-198): an ivory card, a large rank, a big suit glyph in the middle of the pip
// cards and a geometric court card (a monogram under a crown). Every card keeps both its symbol and its colour. The size
// comes from `--cw` (the card's width) set by the parent; everything inside scales with it (container units).

import type { Card } from "$lib/api/types";
import { cardName, rankLabel } from "$lib/i18n/i18n.svelte";
import Suit from "./Suit.svelte";

;type $$ComponentProps =  { card: Pick<Card, "rank" | "suit">; label?: boolean; class?: string };function $$render() {

  
  
  
  
  
  

  let { card, label = true, class: extra = "" }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();

  const red = $derived(card.suit === "HEARTS" || card.suit === "DIAMONDS");
  const court = $derived(card.rank === "J" || card.rank === "Q" || card.rank === "K");
  const shown = $derived(rankLabel(card.rank));
;
async () => {

 { svelteHTML.createElement("div", {        "class":`face ${extra}`,"role":label ? "img" : undefined,"aria-label":label ? cardName(card) : undefined,...__sveltets_2_empty({"data-card":`${card.rank}-${card.suit}`}),});red;court;
   { svelteHTML.createElement("span", {   "class":`index top`,"aria-hidden":`true`,}); { svelteHTML.createElement("b", {});shown; } { const $$_tiuS2C = __sveltets_2_ensureComponent(Suit); new $$_tiuS2C({ target: __sveltets_2_any(), props: {  "suit":card.suit,}});} }
   { svelteHTML.createElement("span", {   "class":`index bottom`,"aria-hidden":`true`,}); { svelteHTML.createElement("b", {});shown; } { const $$_tiuS2C = __sveltets_2_ensureComponent(Suit); new $$_tiuS2C({ target: __sveltets_2_any(), props: {  "suit":card.suit,}});} }
  if(court){
     { svelteHTML.createElement("span", {   "class":`portrait`,"aria-hidden":`true`,});
       { svelteHTML.createElement("svg", {   "class":`crown`,"viewBox":`0 0 60 30`,});
        if(card.rank === "K"){
           { svelteHTML.createElement("path", {  "d":`M4 27 8 6l12 11L30 2l10 15L52 6l4 21z`,});}
        } else if (card.rank === "Q"){
           { svelteHTML.createElement("path", {  "d":`M6 27c0-9 2-16 6-20 3 6 7 9 10 9 2-6 5-11 8-14 3 3 6 8 8 14 3 0 7-3 10-9 4 4 6 11 6 20z`,});}
           { svelteHTML.createElement("circle", {      "cx":`30`,"cy":`3.5`,"r":`3`,});}
        }else{
           { svelteHTML.createElement("path", {  "d":`M8 27V14l8-8h28l8 8v13z`,});}
           { svelteHTML.createElement("path", {    "class":`cut`,"d":`M22 6v21M38 6v21`,});}
        }
       }
       { svelteHTML.createElement("span", { "class":`monogram`,});shown; }
       { const $$_tiuS2C = __sveltets_2_ensureComponent(Suit); new $$_tiuS2C({ target: __sveltets_2_any(), props: {    "suit":card.suit,"class":`small`,}});}
     }
  }else{
     { svelteHTML.createElement("span", {    "class":`pip`,"aria-hidden":`true`,});card.rank === "A"; { const $$_tiuS2C = __sveltets_2_ensureComponent(Suit); new $$_tiuS2C({ target: __sveltets_2_any(), props: {  "suit":card.suit,}});} }
  }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const PlayingCard__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type PlayingCard__SvelteComponent_ = ReturnType<typeof PlayingCard__SvelteComponent_>;
/*Ωignore_endΩ*/export default PlayingCard__SvelteComponent_;