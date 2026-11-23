///<reference types="svelte" />
;// The table's header (US-106): the menu (hint, help, leave), the one status line, Undo (US-146), the spectators (US-071)
// and the score of each team with the target and their progress (US-091, US-109). A rising score counts up.

import { Eye, HelpCircle, Lightbulb, LogOut, Menu, Undo2 } from "@lucide/svelte";
import { fly, scale } from "svelte/transition";
import { Tween } from "svelte/motion";
import { cubicOut } from "svelte/easing";
import { formatNumber, t } from "$lib/i18n/i18n.svelte";
import { settings } from "$lib/stores/settings.svelte";
import SuitText from "$lib/ui/SuitText.svelte";
import type { TableGame } from "./game.svelte";

;type $$ComponentProps =  { game: TableGame; onRules: () => void };function $$render() {

  
  
  
  
  
  
  
  
  
  

  let { game, onRules }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
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
;
async () => {

 { svelteHTML.createElement("svelte:window", {    "onclick":outside,"onkeydown":(event) => event.key === "Escape" && menu && closeMenu(true),});}

 { svelteHTML.createElement("div", { "class":`top`,});
 { svelteHTML.createElement("header", { "class":`header`,});
   { svelteHTML.createElement("div", { "class":`menu-wrap`,});
     { const $$_button3 = svelteHTML.createElement("button", {             "class":`icon-button`,"type":`button`,"aria-controls":`table-menu`,"aria-expanded":menu,"aria-label":t("Menu"),"onclick":() => (menu = !menu),});menuButton = $$_button3;
       { const $$_uneM4C = __sveltets_2_ensureComponent(Menu); new $$_uneM4C({ target: __sveltets_2_any(), props: {      "size":20,"strokeWidth":2.4,"aria-hidden":`true`,}});}
     }
    if(menu){
       { svelteHTML.createElement("div", {     "class":`menu glass`,"id":`table-menu`,});__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('div'),({ start: 0.92, duration: 180 })));
         { svelteHTML.createElement("p", { "class":`menu-title`,});game.menuGame; }
        if(game.hintAvailable){
           { svelteHTML.createElement("button", {   "type":`button`,"onclick":() => { closeMenu(true); game.askHint(); },}); { const $$_blubthgiL5C = __sveltets_2_ensureComponent(Lightbulb); new $$_blubthgiL5C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}t("Hint"); }
        }
         { svelteHTML.createElement("button", {   "type":`button`,"onclick":() => { closeMenu(); onRules(); },}); { const $$_elcriCpleH5C = __sveltets_2_ensureComponent(HelpCircle); new $$_elcriCpleH5C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}t("Help"); }
         { svelteHTML.createElement("a", {   "href":game.exitPath,...__sveltets_2_empty({"data-confirm-leave":true}),"onclick":() => closeMenu(),}); { const $$_tuOgoL5C = __sveltets_2_ensureComponent(LogOut); new $$_tuOgoL5C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}t("Leave table"); }
       }
    }
   }

  if(game.score){
    const [north, east] = game.score.teams;
     { svelteHTML.createElement("div", {     "class":`scores`,"role":`group`,"aria-label":t("Score"),});
       { svelteHTML.createElement("div", {    "class":`team`,...__sveltets_2_empty({"data-team":`0`}),});north.mine;
         { svelteHTML.createElement("span", { "class":`team-name`,});t(north.mine ? "Us" : east.mine ? "Them" : "North–South"); }
         { svelteHTML.createElement("strong", {   "class":`tabular`,"aria-hidden":ns.current !== north.matchScore || undefined,});formatNumber(Math.round(ns.current)); }
        if(north.roundPoints != null){ { svelteHTML.createElement("small", { "class":`tabular`,}); formatNumber(north.roundPoints); }}
         { svelteHTML.createElement("span", {   "class":`bar`,"aria-hidden":`true`,}); { svelteHTML.createElement("i", { });__sveltets_2_ensureType(String, Number, north.progress); } }
       }
       { svelteHTML.createElement("span", { "class":`target tabular`,});t("to {0}", formatNumber(game.score.target)); }
       { svelteHTML.createElement("div", {    "class":`team`,...__sveltets_2_empty({"data-team":`1`}),});east.mine;
         { svelteHTML.createElement("span", { "class":`team-name`,});t(east.mine ? "Us" : north.mine ? "Them" : "East–West"); }
         { svelteHTML.createElement("strong", {   "class":`tabular`,"aria-hidden":ew.current !== east.matchScore || undefined,});formatNumber(Math.round(ew.current)); }
        if(east.roundPoints != null){ { svelteHTML.createElement("small", { "class":`tabular`,}); formatNumber(east.roundPoints); }}
         { svelteHTML.createElement("span", {   "class":`bar`,"aria-hidden":`true`,}); { svelteHTML.createElement("i", { });__sveltets_2_ensureType(String, Number, east.progress); } }
       }
     }
  }else{
     { svelteHTML.createElement("div", { "class":`scores placeholder`,}); { svelteHTML.createElement("span", { "class":`game-title`,});game.title; } }
  }

  if(game.hintAvailable){
     { svelteHTML.createElement("button", {         "class":`icon-button hint`,"type":`button`,"aria-label":t("Hint"),"onclick":() => game.askHint(),});__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('button'),({ duration: 200 })));
       { const $$_blubthgiL3C = __sveltets_2_ensureComponent(Lightbulb); new $$_blubthgiL3C({ target: __sveltets_2_any(), props: {      "size":20,"strokeWidth":2.4,"aria-hidden":`true`,}});}
     }
  }else{
     { svelteHTML.createElement("span", {   "class":`icon-spacer`,"aria-hidden":`true`,}); }
  }
 }

 { svelteHTML.createElement("div", { "class":`status-row`,});
   { svelteHTML.createElement("p", {    "class":`status`,"role":`status`,});game.statusFlash;
    game.status; { { svelteHTML.createElement("span", {  });__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('span'),({ y: 6, duration: 200 }))); { const $$_txeTtiuS4C = __sveltets_2_ensureComponent(SuitText); new $$_txeTtiuS4C({ target: __sveltets_2_any(), props: {  "text":game.status,}});} }}
   }
  if(game.undo){
     { svelteHTML.createElement("button", {       "class":`undo`,"type":`button`,"onclick":() => game.takeBack(),});__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('button'),({ duration: 200 }))); { const $$_2odnU3C = __sveltets_2_ensureComponent(Undo2); new $$_2odnU3C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Undo ({0} left)", game.undo.left); }
  }
  if(game.watchers){
     { svelteHTML.createElement("p", {   "class":`watchers`,"role":`status`,}); { const $$_eyE3C = __sveltets_2_ensureComponent(Eye); new $$_eyE3C({ target: __sveltets_2_any(), props: {    "size":14,"aria-hidden":`true`,}});}game.watchers; }
  }
 }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const TableHeader__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type TableHeader__SvelteComponent_ = ReturnType<typeof TableHeader__SvelteComponent_>;
/*Ωignore_endΩ*/export default TableHeader__SvelteComponent_;