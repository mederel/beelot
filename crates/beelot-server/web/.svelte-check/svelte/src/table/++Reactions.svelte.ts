///<reference types="svelte" />
;// Reactions at online tables (US-020): a button opens the six presets (a side panel that stays open from 1024 px,
// US-125); a tap sends one. A reaction shows for a few seconds beside the seat it came from.

import { SmilePlus } from "@lucide/svelte";
import { scale, fly } from "svelte/transition";
import { t } from "$lib/i18n/i18n.svelte";
import { REACTIONS, type TableGame } from "./game.svelte";

;type $$ComponentProps =  { game: TableGame };function $$render() {

  
  
  
  
  
  

  let { game }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
  const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  $effect(() => {
    if (game.reactions.allowed && wide) game.reactions.tray = true;
  });
;
async () => {

 { svelteHTML.createElement("div", {   "class":`reaction-layer`,"aria-live":`polite`,});
     for(let bubble of __sveltets_2_ensureArray(game.bubbles)){bubble.key;
     { svelteHTML.createElement("p", {     "class":`bubble ${game.placement(bubble.seat)}`,"aria-label":t("{0}: {1}", game.seats[bubble.seat]?.name ?? "", bubble.text),});__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('p'),({ start: 0.5, duration: 280 })));bubble.text; }
  }
 }

if(game.reactions.allowed){
   { svelteHTML.createElement("button", {           "class":`toggle`,"type":`button`,"aria-expanded":game.reactions.tray,"aria-controls":`reaction-tray`,"aria-label":t("Open reactions"),"onclick":() => (game.reactions.tray = !game.reactions.tray),});
     { const $$_sulPelimS1C = __sveltets_2_ensureComponent(SmilePlus); new $$_sulPelimS1C({ target: __sveltets_2_any(), props: {    "size":22,"aria-hidden":`true`,}});}
   }
  if(game.reactions.tray){
     { svelteHTML.createElement("div", {         "class":`tray glass`,"id":`reaction-tray`,"role":`group`,"aria-label":t("Reactions"),});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ x: 30, duration: 240 })));
         for(let [key, [emoji, label]] of __sveltets_2_ensureArray(Object.entries(REACTIONS))){key;
         { svelteHTML.createElement("button", {   "type":`button`,"onclick":() => game.react(key),}); { svelteHTML.createElement("span", { "aria-hidden":`true`,});emoji; } t(label); }
      }
     }
  }
}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Reactions__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Reactions__SvelteComponent_ = ReturnType<typeof Reactions__SvelteComponent_>;
/*Ωignore_endΩ*/export default Reactions__SvelteComponent_;