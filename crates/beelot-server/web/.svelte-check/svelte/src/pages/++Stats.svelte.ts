///<reference types="svelte" />
;// My statistics (US-024, US-068, US-124): a guest is invited to sign in; a signed-in player sees the record, one panel at
// a time (overall, by variant, by bot difficulty), the rating and its history, the contracts and the recent matches.

import { Flame, Swords, Trophy, Target } from "@lucide/svelte";
import { onMount } from "svelte";
import { fly } from "svelte/transition";
import { apiJson, type ApiError } from "$lib/api/client";
import { formatNumber, language, localized, playerName, t } from "$lib/i18n/i18n.svelte";
import { ratingRows, sparklinePoints, statsPanel, type RatingRow } from "$lib/models/small";
import { goals, goalText } from "$lib/stores/goals.svelte";
import Segmented from "$lib/ui/Segmented.svelte";
import Button from "$lib/ui/Button.svelte";
import SignInPanel from "./SignInPanel.svelte";
import ProgressTabs from "./ProgressTabs.svelte";
function $$render() {

  
  
  
  
  
  
  
  
  
  
  
  
  

  let view = $state<"loading" | "guest" | "empty" | "error" | "ready">("loading");
  let stats = $state<any>(null);
  let ratings = $state<RatingRow[]>([]);
  let panel = $state<"overall" | "variant" | "difficulty">("overall");
  let signIn = $state(false);

  const labels: Record<string, string> = {
    CLASSIC: "Classic Belote",
    CONTREE: "Contrée",
    RELAXED: "Relaxed",
    CHALLENGING: "Challenging",
    SOLO: "Against bots",
    PRIVATE: "Private table",
    PUBLIC: "Public table"
  };
  const label = (key: string) => t(labels[key] ?? key);
  const percent = (value: number | null | undefined) => (value == null ? "—" : `${formatNumber(value)} %`);

  async function load() {
    view = "loading";
    try {
      stats = await apiJson("/api/statistics");
    } catch (error) {
      stats = null;
      if ((error as ApiError).status === 401) {
        view = "guest";
        return;
      }
    }
    if (!stats) {
      view = "error";
      return;
    }
    if (stats.overall.played === 0) {
      view = "empty";
      return;
    }
    view = "ready";
    try {
      ratings = ratingRows((await apiJson("/api/ratings")).ratings);
    } catch {
      // The record above is still shown; the wrapper has shown the connection note when the connection was the cause.
      ratings = ratingRows(undefined);
    }
  }

  onMount(load);

  const facts = $derived.by(() => {
    if (!stats) return [];
    const contracts = stats.contracts;
    return [
      ["Contracts taken by your team", formatNumber(contracts.taken)],
      ["Contracts made", contracts.taken === 0 ? "—" : t("{0} ({1})", formatNumber(contracts.made), percent(Math.round((100 * contracts.made) / contracts.taken)))],
      ["Coinches by your team", t("{0}, {1} defeated the contract", formatNumber(contracts.coinchesByTeam), formatNumber(contracts.coinchesByTeamWon))],
      ["Coinches against your team", t("{0}, {1} defeated your contract", formatNumber(contracts.coinchesAgainstTeam), formatNumber(contracts.coinchesAgainstTeamWon))],
      ["Capots", formatNumber(contracts.capots)],
      ["Belotes", formatNumber(contracts.belotes)],
      ["Average points per round", stats.averagePointsPerRound == null ? "—" : formatNumber(stats.averagePointsPerRound)]
    ];
  });
  const dateFormat = $derived(new Intl.DateTimeFormat(language(), { dateStyle: "medium", timeStyle: "short" }));
  const winRate = $derived(stats?.overall?.winRate ?? 0);
;
async () => {

 { svelteHTML.createElement("div", { "class":`page stats`,});
   { svelteHTML.createElement("header", { "class":`head`,});
     { const $$_sbaTssergorP2C = __sveltets_2_ensureComponent(ProgressTabs); new $$_sbaTssergorP2C({ target: __sveltets_2_any(), props: {  "current":`stats`,}});}
     { svelteHTML.createElement("p", { "class":`eyebrow`,});t("Your progress"); }
     { svelteHTML.createElement("h1", { "class":`page-title`,});t("My statistics"); }
    if(goals.ledger){ { svelteHTML.createElement("p", { "class":`goal`,}); { const $$_emalF3C = __sveltets_2_ensureComponent(Flame); new $$_emalF3C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}goalText(); }}
   }

  if(view === "guest"){
     { svelteHTML.createElement("section", {   "class":`card glass`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('section'),({ y: 12, duration: 300 })));
       { svelteHTML.createElement("h2", {});localized({ code: "sign-in-statistics" }, "Sign in to see your statistics."); }
       { svelteHTML.createElement("p", { "class":`muted`,});t("Create an account with a passkey to keep your results and see your progress here."); }
      if(signIn){ { const $$_lenaPnIngiS2C = __sveltets_2_ensureComponent(SignInPanel); new $$_lenaPnIngiS2C({ target: __sveltets_2_any(), props: {  "ondone":load,}});}}else{ { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"onclick":() => (signIn = true),}});t("Sign in"); Button}}
     }
  } else if (view === "empty"){
     { svelteHTML.createElement("p", { "class":`card glass muted`,});t("No finished matches yet. Finish a match while signed in and it will appear here."); }
  } else if (view === "error"){
     { svelteHTML.createElement("p", { "class":`card glass muted`,});t("Something went wrong. Please try again."); }
  } else if (view === "ready" && stats){
     { svelteHTML.createElement("section", {     "class":`overview`,"aria-label":t("Match record"),});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('section'),({ y: 12, duration: 300 })));
       { svelteHTML.createElement("div", {  "class":`ring glass`,});__sveltets_2_ensureType(String, Number, winRate);
         { svelteHTML.createElement("svg", {   "viewBox":`0 0 120 120`,"aria-hidden":`true`,}); { svelteHTML.createElement("circle", {        "class":`track`,"cx":`60`,"cy":`60`,"r":`50`,});} { svelteHTML.createElement("circle", {          "class":`value`,"cx":`60`,"cy":`60`,"r":`50`,"pathLength":`100`,});} }
         { svelteHTML.createElement("span", {}); { svelteHTML.createElement("strong", { "class":`tabular`,});percent(stats.overall.winRate); } { svelteHTML.createElement("small", {});t("Win rate"); } }
       }
       { svelteHTML.createElement("div", { "class":`tiles`,});
         { svelteHTML.createElement("p", { "class":`tile glass`,}); { const $$_sdrowS4C = __sveltets_2_ensureComponent(Swords); new $$_sdrowS4C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});} { svelteHTML.createElement("strong", { "class":`tabular`,});formatNumber(stats.overall.played); } { svelteHTML.createElement("span", {});t("Matches played"); } }
         { svelteHTML.createElement("p", { "class":`tile glass`,}); { const $$_yhporT4C = __sveltets_2_ensureComponent(Trophy); new $$_yhporT4C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});} { svelteHTML.createElement("strong", { "class":`tabular`,});formatNumber(stats.overall.won); } { svelteHTML.createElement("span", {});t("Wins"); } }
         { svelteHTML.createElement("p", { "class":`tile glass`,}); { const $$_tegraT4C = __sveltets_2_ensureComponent(Target); new $$_tegraT4C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});} { svelteHTML.createElement("strong", { "class":`tabular`,});formatNumber(stats.overall.lost); } { svelteHTML.createElement("span", {});t("Losses"); } }
       }
     }

     { const $$_detnemgeS1C = __sveltets_2_ensureComponent(Segmented); const $$_detnemgeS1 = new $$_detnemgeS1C({ target: __sveltets_2_any(), props: {        "name":`stats-view`,"label":t("Record"),value:panel,"options":[{ value: "overall", label: t("Overall") }, { value: "variant", label: t("By variant") }, { value: "difficulty", label: t("By bot difficulty") }],}});/*Ωignore_startΩ*/() => panel = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_detnemgeS1.$$bindings = 'value';}

    if(statsPanel(panel) !== "overall"){
      const rows = panel === "variant" ? stats.byVariant : stats.byDifficulty;
       { svelteHTML.createElement("section", {   "class":`card glass`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('section'),({ y: 8, duration: 250 })));
         { svelteHTML.createElement("h2", {});t(panel === "variant" ? "By variant" : "Solo games by difficulty"); }
         { svelteHTML.createElement("div", { "class":`scroll`,});
           { svelteHTML.createElement("table", { "class":`data-table`,});
             { svelteHTML.createElement("thead", {}); { svelteHTML.createElement("tr", {}); { svelteHTML.createElement("th", { "scope":`col`,}); } { svelteHTML.createElement("th", { "scope":`col`,});t("Played"); } { svelteHTML.createElement("th", { "scope":`col`,});t("Wins"); } { svelteHTML.createElement("th", { "scope":`col`,});t("Losses"); } { svelteHTML.createElement("th", { "scope":`col`,});t("Win rate"); } } }
             { svelteHTML.createElement("tbody", {});
                 for(let record of __sveltets_2_ensureArray(rows)){record.key;
                 { svelteHTML.createElement("tr", {}); { svelteHTML.createElement("th", { "scope":`row`,});label(record.key); } { svelteHTML.createElement("td", {});formatNumber(record.played); } { svelteHTML.createElement("td", {});formatNumber(record.won); } { svelteHTML.createElement("td", {});formatNumber(record.lost); } { svelteHTML.createElement("td", {});percent(record.winRate); } }
              }
             }
           }
         }
       }
    }

    if(ratings.length){
       { svelteHTML.createElement("section", { "class":`card glass`,});
         { svelteHTML.createElement("h2", {});t("Rating"); }
         { svelteHTML.createElement("div", { "class":`ratings`,});
             for(let row of __sveltets_2_ensureArray(ratings)){row.variant;
             { svelteHTML.createElement("div", { "class":`rating`,});
               { svelteHTML.createElement("span", { "class":`muted`,});label(row.variant); }
               { svelteHTML.createElement("strong", { "class":`tabular`,});row.provisional ? t("{0} ± {1} (provisional)", formatNumber(row.rating), formatNumber(row.deviation)) : t("{0} ± {1}", formatNumber(row.rating), formatNumber(row.deviation)); }
               { svelteHTML.createElement("small", { "class":`muted`,});t("Matches"); formatNumber(row.matches); }
              if(row.history.length > 1){
                 { svelteHTML.createElement("svg", {       "class":`spark`,"viewBox":`0 0 200 40`,"role":`img`,"aria-label":t("Rating history, {0}: from {1} to {2}", label(row.variant), formatNumber(row.history[0].rating), formatNumber(row.history[row.history.length - 1].rating)),});
                   { svelteHTML.createElement("polyline", {  "points":sparklinePoints(row.history, 200, 40),});}
                 }
              }
             }
          }
         }
         { svelteHTML.createElement("p", { "class":`note`,});t("Public matches with four human players change your rating (Glicko-2). A rating stays provisional until its uncertainty is small."); }
       }
    }

     { svelteHTML.createElement("section", { "class":`card glass`,});
       { svelteHTML.createElement("h2", {});t("Contracts"); }
       { svelteHTML.createElement("dl", { "class":`facts`,});
           for(let [term, value] of __sveltets_2_ensureArray(facts)){term; { svelteHTML.createElement("div", {}); { svelteHTML.createElement("dt", {});t(term); } { svelteHTML.createElement("dd", { "class":`tabular`,});value; } }}
       }
     }

     { svelteHTML.createElement("section", { "class":`card glass`,});
       { svelteHTML.createElement("h2", {});t("Recent matches"); }
       { svelteHTML.createElement("div", { "class":`scroll`,});
         { svelteHTML.createElement("table", { "class":`data-table`,});
           { svelteHTML.createElement("thead", {});
             { svelteHTML.createElement("tr", {});   for(let heading of __sveltets_2_ensureArray((["Date", "Mode", "Variant", "Target", "Partner", "Opponents", "Score", "Result"]))){heading; { svelteHTML.createElement("th", { "scope":`col`,});t(heading); }} }
           }
           { svelteHTML.createElement("tbody", {});
                for(let match of __sveltets_2_ensureArray(stats.recentMatches)){let index = 1;index;
               { svelteHTML.createElement("tr", {});
                 { svelteHTML.createElement("th", { "scope":`row`,});dateFormat.format(new Date(match.endedAt)); }
                 { svelteHTML.createElement("td", {});match.mode === "SOLO" && match.difficulty ? t("{0} ({1})", label(match.mode), label(match.difficulty)) : label(match.mode); }
                 { svelteHTML.createElement("td", {});label(match.variant); }
                 { svelteHTML.createElement("td", {});formatNumber(match.target); }
                 { svelteHTML.createElement("td", {});playerName(match.partner); }
                 { svelteHTML.createElement("td", {});match.opponents.map(playerName).join(", "); }
                 { svelteHTML.createElement("td", {});formatNumber(match.teamScore);  formatNumber(match.opponentScore); }
                 { svelteHTML.createElement("td", {}); { svelteHTML.createElement("span", {  "class":`result`,});match.won;t(match.won ? "Won" : "Lost"); } }
               }
            }
           }
         }
       }
     }
  }
 }


};
return { props: {} as Record<string, never>, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Stats__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Stats__SvelteComponent_ = ReturnType<typeof Stats__SvelteComponent_>;
/*Ωignore_endΩ*/export default Stats__SvelteComponent_;