///<reference types="svelte" />
;// The round's result: contract made or failed (or the match's winner), each team's points, the breakdown, and the next
// round, the results of a finished match, or the review of the round (US-066).

import { ArrowRight, ChevronDown, History, Trophy } from "@lucide/svelte";
import { fly, slide } from "svelte/transition";
import { formatNumber, t } from "$lib/i18n/i18n.svelte";
import { settings } from "$lib/stores/settings.svelte";
import Button from "$lib/ui/Button.svelte";
import type { TableGame } from "./game.svelte";

;type $$ComponentProps =  { game: TableGame };function $$render() {

  
  
  
  
  
  
  
  

  let { game }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
  const round = $derived(game.round!);
  let details = $state(false);
  const myTeam = $derived(game.viewer % 2);
;
async () => {

 { svelteHTML.createElement("section", {      "class":`result glass`,"aria-labelledby":`round-title`,});round.made;__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('section'),({ y: settings.effects === "full" ? 60 : 0, duration: 420 })));
   { svelteHTML.createElement("h2", { "id":`round-title`,});round.title; }
   { svelteHTML.createElement("div", { "class":`teams`,});
     { svelteHTML.createElement("div", {  "class":`team`,});myTeam === 0; { svelteHTML.createElement("small", {});t(myTeam === 0 ? "Us" : "Them"); } { svelteHTML.createElement("strong", { "class":`tabular`,}); formatNumber(round.northSouth); } }
     { svelteHTML.createElement("div", {  "class":`team`,});myTeam === 1; { svelteHTML.createElement("small", {});t(myTeam === 1 ? "Us" : "Them"); } { svelteHTML.createElement("strong", { "class":`tabular`,}); formatNumber(round.eastWest); } }
   }
   { svelteHTML.createElement("button", {       "class":`details-toggle`,"type":`button`,"aria-expanded":details,"onclick":() => (details = !details),});t("Details");  { const $$_nwoDnorvehC2C = __sveltets_2_ensureComponent(ChevronDown); new $$_nwoDnorvehC2C({ target: __sveltets_2_any(), props: {      "size":16,"aria-hidden":`true`,"class":details ? "open" : "",}});} }
  if(details){ { svelteHTML.createElement("p", {   "class":`breakdown`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('p'),({ duration: 220 })));round.breakdown; }}
   { svelteHTML.createElement("p", { "class":`visually-hidden`,});round.breakdown; }
   { svelteHTML.createElement("div", { "class":`actions`,});
    if(round.next){ { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"size":`lg`,"onclick":() => game.nextRound(),}});t("Deal next round");  { const $$_thgiRworrA3C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA3C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});} Button}}
    if(round.results){ { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"size":`lg`,"onclick":() => game.reopenMatchEnd(),}}); { const $$_yhporT3C = __sveltets_2_ensureComponent(Trophy); new $$_yhporT3C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}t("Results"); Button}}
    if(round.review){ { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"onclick":() => game.openReview(),}}); { const $$_yrotsiH3C = __sveltets_2_ensureComponent(History); new $$_yrotsiH3C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}t("Review round"); Button}}
   }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const RoundResult__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type RoundResult__SvelteComponent_ = ReturnType<typeof RoundResult__SvelteComponent_>;
/*Ωignore_endΩ*/export default RoundResult__SvelteComponent_;