///<reference types="svelte" />
;// The leaderboard (US-069): the top 50 of a variant with the viewer's own place, and the daily deal's board (US-150).

import { Crown, CalendarDays } from "@lucide/svelte";
import { onMount } from "svelte";
import { apiJson } from "$lib/api/client";
import { formatNumber, t } from "$lib/i18n/i18n.svelte";
import { dailyMineNote, isMineListed, mineNote, type DailyInfo } from "$lib/models/small";
import Segmented from "$lib/ui/Segmented.svelte";
import ProgressTabs from "./ProgressTabs.svelte";
function $$render() {

  
  
  
  
  
  
  
  

  let variant = $state<"CLASSIC" | "CONTREE">("CLASSIC");
  let board = $state<any>(null);
  let failed = $state(false);
  let day = $state<"today" | "yesterday">("today");
  let daily = $state<DailyInfo | null>(null);
  let dailyKnown = $state(false);

  async function loadBoard() {
    failed = false;
    try {
      board = await apiJson(`/api/leaderboard?variant=${variant}`);
    } catch {
      // The wrapper has shown the connection note when the connection was the cause.
      board = null;
    }
    failed = !board;
  }

  async function loadDaily() {
    try {
      daily = await apiJson<DailyInfo>(`/api/daily?day=${day}`);
    } catch {
      daily = null;
    }
    dailyKnown = true;
  }

  onMount(() => {
    loadBoard();
    loadDaily();
  });

  const note = $derived(board ? mineNote(board.mine, board.minMatches) : null);
  const dailyNote = $derived(daily ? dailyMineNote(daily.mine) : null);
;
async () => {

 { svelteHTML.createElement("div", { "class":`page board`,});
   { svelteHTML.createElement("header", { "class":`head`,});
     { const $$_sbaTssergorP2C = __sveltets_2_ensureComponent(ProgressTabs); new $$_sbaTssergorP2C({ target: __sveltets_2_any(), props: {  "current":`leaderboard`,}});}
     { svelteHTML.createElement("p", { "class":`eyebrow`,});t("Compare yourself"); }
     { svelteHTML.createElement("h1", { "class":`page-title`,});t("Leaderboard"); }
   }

   { const $$_detnemgeS1C = __sveltets_2_ensureComponent(Segmented); const $$_detnemgeS1 = new $$_detnemgeS1C({ target: __sveltets_2_any(), props: {          "name":`board-variant`,"label":t("Variant"),value:variant,"onchange":loadBoard,"options":[{ value: "CLASSIC", label: t("Classic Belote") }, { value: "CONTREE", label: t("Contrée") }],}});/*Ωignore_startΩ*/() => variant = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_detnemgeS1.$$bindings = 'value';}

  if(note){ { svelteHTML.createElement("p", {   "class":`mine`,"role":`status`,});t(note.text, ...note.values.map((value) => formatNumber(value))); }}
  if(failed){
     { svelteHTML.createElement("p", { "class":`muted`,});t("Something went wrong. Please try again."); }
  } else if (board && board.rows.length === 0){
     { svelteHTML.createElement("p", { "class":`muted`,});t("Nobody is listed yet. Players appear after ten rated matches in public games."); }
  } else if (board){
     { svelteHTML.createElement("ol", { "class":`ranks glass`,});
         for(let row of __sveltets_2_ensureArray(board.rows)){row.rank;
        const mine = isMineListed(board.rows, board.mine) && row.rank === board.mine.rank;
         { svelteHTML.createElement("li", {    ...__sveltets_2_empty({"data-rank":row.rank}),});mine;row.rank <= 3;
           { svelteHTML.createElement("span", { "class":`rank tabular`,});if(row.rank === 1){ { const $$_nworC4C = __sveltets_2_ensureComponent(Crown); new $$_nworC4C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}}else{formatNumber(row.rank);} }
           { svelteHTML.createElement("span", { "class":`name`,});row.name; }
           { svelteHTML.createElement("span", { "class":`rating tabular`,});formatNumber(row.rating); }
           { svelteHTML.createElement("small", { "class":`tabular`,});t("{0} matches", formatNumber(row.matches)); }
         }
      }
     }
  }
   { svelteHTML.createElement("p", { "class":`note`,});t("The top 50 players of the variant, rated with Glicko-2 from public matches with four human players. Players need at least ten rated matches to be listed."); }

  if(dailyKnown && daily){
     { svelteHTML.createElement("section", { "class":`daily glass`,});
       { svelteHTML.createElement("h2", {}); { const $$_syaDradnelaC3C = __sveltets_2_ensureComponent(CalendarDays); new $$_syaDradnelaC3C({ target: __sveltets_2_any(), props: {    "size":20,"aria-hidden":`true`,}});}t("Daily deal"); }
       { const $$_detnemgeS2C = __sveltets_2_ensureComponent(Segmented); const $$_detnemgeS2 = new $$_detnemgeS2C({ target: __sveltets_2_any(), props: {            "name":`daily-day`,"label":t("Day"),"size":`sm`,value:day,"onchange":loadDaily,"options":[{ value: "today", label: t("Today") }, { value: "yesterday", label: t("Yesterday") }],}});/*Ωignore_startΩ*/() => day = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_detnemgeS2.$$bindings = 'value';}
      if(dailyNote){ { svelteHTML.createElement("p", {   "class":`mine`,"role":`status`,});t(dailyNote.text, ...dailyNote.values.map((value) => formatNumber(value))); }}
      if(daily.rows.length === 0){
         { svelteHTML.createElement("p", { "class":`muted`,});t("No score yet for this day."); }
      }else{
         { svelteHTML.createElement("table", { "class":`data-table`,});
           { svelteHTML.createElement("thead", {}); { svelteHTML.createElement("tr", {}); { svelteHTML.createElement("th", { "scope":`col`,});  } { svelteHTML.createElement("th", { "scope":`col`,});t("Player"); } { svelteHTML.createElement("th", { "scope":`col`,});t("Score"); } } }
           { svelteHTML.createElement("tbody", {});
               for(let row of __sveltets_2_ensureArray(daily.rows)){row.rank; { svelteHTML.createElement("tr", {}); { svelteHTML.createElement("th", { "scope":`row`,});formatNumber(row.rank); } { svelteHTML.createElement("td", {});row.name; } { svelteHTML.createElement("td", {});formatNumber(row.score); } }}
           }
         }
      }
       { svelteHTML.createElement("p", { "class":`note`,});t("The same deal for everyone, one try a day for signed-in players. Guests can play it but are not ranked."); }
     }
  }
 }


};
return { props: {} as Record<string, never>, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Leaderboard__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Leaderboard__SvelteComponent_ = ReturnType<typeof Leaderboard__SvelteComponent_>;
/*Ωignore_endΩ*/export default Leaderboard__SvelteComponent_;