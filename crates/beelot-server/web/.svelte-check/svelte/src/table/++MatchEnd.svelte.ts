///<reference types="svelte" />
;// The end of the match (US-093): the winner, the first game or win celebrated (US-113), the podium whose scores count
// up, the recap, the rematch (US-114), the account offer (US-115), and play again, change options, home or view the table.

import { onMount, untrack } from "svelte";
import { Tween } from "svelte/motion";
import { cubicOut } from "svelte/easing";
import { fly, scale } from "svelte/transition";
import { Home, Eye, Settings2, Trophy, Repeat } from "@lucide/svelte";
import { formatNumber, playerName, t } from "$lib/i18n/i18n.svelte";
import { rematchTexts } from "$lib/models/moments";
import { signInRequest } from "$lib/stores/account.svelte";
import { navigate } from "$lib/stores/router.svelte";
import { settings } from "$lib/stores/settings.svelte";
import Button from "$lib/ui/Button.svelte";
import { portal } from "$lib/ui/portal";
import Bee from "$lib/brand/Bee.svelte";
import type { TableGame } from "./game.svelte";

;type $$ComponentProps =  { game: TableGame };function $$render() {

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  let { game }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
  const model = $derived(game.matchEnd!);
  const first = $derived(game.matchEndAnimate ? ({ firstWin: "First win!", firstGame: "First game!" } as Record<string, string>)[model.goal?.celebration ?? ""] : undefined);
  const celebrating = $derived(game.matchEndAnimate && (model.iWon || first !== undefined));
  const rematch = $derived(rematchTexts(model.rematch ?? { state: "idle", names: [] }, t));
  const scores = untrack(() => model.podium).map((step) => new Tween(game.matchEndAnimate && settings.effects === "full" ? 0 : step.score, { duration: 1200, easing: cubicOut }));
  let playButton: HTMLElement | null = $state(null);
  let overlay: HTMLElement;

  onMount(() => {
    model.podium.forEach((step, index) => scores[index].set(step.score));
    playButton?.focus({ preventScroll: true });
    const main = document.getElementById("main");
    if (main) main.inert = true;
    return () => {
      if (main) main.inert = false;
    };
  });

  const labels: Record<string, string> = { tierce: "tierce", cinquante: "cinquante", cent: "cent", carre: "carré" };
  function createAccount() {
    game.dismissMatchEnd();
    signInRequest.open = true;
    signInRequest.signUp = true;
    navigate("/settings");
  }
;
async () => {

 { svelteHTML.createElement("svelte:window", {  "onkeydown":(event) => event.key === "Escape" && game.dismissMatchEnd(),});}

 {const $$action_0 = __sveltets_2_ensureAction(portal(svelteHTML.mapElementTag('div')));{ const $$_div0 = svelteHTML.createElement("div", __sveltets_2_union($$action_0), {          "class":`match-end`,"role":`dialog`,"aria-modal":`true`,"aria-labelledby":`match-end-title`,});overlay = $$_div0;__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: settings.effects === "full" ? 40 : 0, duration: 400, opacity: 0 })));
   { svelteHTML.createElement("div", { "class":`content`,});
     { svelteHTML.createElement("div", {    "class":`trophy`,"aria-hidden":`true`,});celebrating;
      if(celebrating){ { const $$_yhporT3C = __sveltets_2_ensureComponent(Trophy); new $$_yhporT3C({ target: __sveltets_2_any(), props: {    "size":56,"strokeWidth":1.8,}});}}else{ { const $$_eeB3C = __sveltets_2_ensureComponent(Bee); new $$_eeB3C({ target: __sveltets_2_any(), props: {  "size":`4rem`,}});}}
     }
    if(celebrating){ { svelteHTML.createElement("p", {   "class":`sticker`,});__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('p'),({ start: 0.3, duration: 600, delay: 150 })));t(first ?? "Victory!"); }}
     { svelteHTML.createElement("h2", { "id":`match-end-title`,});t("{0} win the match!", t(model.winner)); }
    if(model.goal){ { svelteHTML.createElement("p", { "class":`goal`,});model.goal.message; }}

     { svelteHTML.createElement("p", { "class":`eyebrow`,});t("Final score"); }
     { svelteHTML.createElement("div", { "class":`podium`,});
          for(let step of __sveltets_2_ensureArray(model.podium)){let index = 1;step.team;
         { svelteHTML.createElement("div", {     "class":`step`,...__sveltets_2_empty({"data-place":step.place}),});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: 50, duration: 600, delay: game.matchEndAnimate ? 250 + index * 150 : 0 })));
           { svelteHTML.createElement("span", { "class":`names`,});step.names.map(playerName).join(" · "); }
           { svelteHTML.createElement("strong", { "class":`tabular`,});formatNumber(Math.round(scores[index].current)); }
           { svelteHTML.createElement("span", { "class":`place`,});step.place; }
         }
      }
     }

     { svelteHTML.createElement("div", { "class":`recap glass`,});
       { svelteHTML.createElement("p", {});t("{0} rounds", model.recap.rounds); }
      if(model.recap.biggestRound){
        const big = model.recap.biggestRound;
         { svelteHTML.createElement("p", {});t("Biggest round: {0} points, {1}, round {2}", formatNumber(big.points), t(big.team), big.round); }
      }
       { svelteHTML.createElement("p", { "class":`recap-heading`,});t("Announcements"); }
         for(let team of __sveltets_2_ensureArray(model.recap.announcements)){team.team;
         { svelteHTML.createElement("p", {});t(team.team); team.items.length ? team.items.map(({ kind, count }) => `${t(labels[kind])} ×${count}`).join(", ") : t("None"); }
      }
     }

    if(rematch.status){ { svelteHTML.createElement("p", {   "class":`rematch`,"role":`status`,});rematch.status; }}

    if(model.offer){
       { svelteHTML.createElement("section", {   "class":`offer glass`,"aria-labelledby":`offer-text`,});
         { svelteHTML.createElement("p", { "id":`offer-text`,});t("Keep this result: create an account with a passkey."); }
         { svelteHTML.createElement("div", { "class":`row`,});
           { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"size":`sm`,"variant":`secondary`,"onclick":createAccount,}});t("Create an account"); Button}
           { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"size":`sm`,"variant":`ghost`,"onclick":() => { game.dismissOffer(); playButton?.focus({ preventScroll: true }); },}});t("Not now"); Button}
         }
       }
    }

     { svelteHTML.createElement("div", { "class":`actions`,});
       { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); const $$_nottuB3 = new $$_nottuB3C({ target: __sveltets_2_any(), props: {        children:() => { return __sveltets_2_any(0); },element:playButton,"size":`lg`,"block":true,"disabled":rematch.disabled,"onclick":() => game.rematch(),}});/*Ωignore_startΩ*/() => playButton = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_nottuB3.$$bindings = 'element'; { const $$_taepeR4C = __sveltets_2_ensureComponent(Repeat); new $$_taepeR4C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}rematch.label; Button}
       { svelteHTML.createElement("div", { "class":`row`,});
        if(model.solo){ { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"href":`/play/bot`,"onclick":() => game.dismissMatchEnd(),}}); { const $$_2sgnitteS5C = __sveltets_2_ensureComponent(Settings2); new $$_2sgnitteS5C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Change options"); Button}}
         { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"href":`/`,"onclick":() => game.dismissMatchEnd(),}}); { const $$_emoH5C = __sveltets_2_ensureComponent(Home); new $$_emoH5C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Back to home"); Button}
       }
       { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"variant":`ghost`,"onclick":() => game.dismissMatchEnd(),}}); { const $$_eyE4C = __sveltets_2_ensureComponent(Eye); new $$_eyE4C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("View table"); Button}
     }
   }
 }}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const MatchEnd__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type MatchEnd__SvelteComponent_ = ReturnType<typeof MatchEnd__SvelteComponent_>;
/*Ωignore_endΩ*/export default MatchEnd__SvelteComponent_;