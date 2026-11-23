///<reference types="svelte" />
;// The card table (US-119): the header with the scores and the menu, the felt with the four seats and the trick, the hand,
// and what comes over them: the auction (US-120), the online lobby (US-121), the round's result, the match end, the
// round review, the reactions, the pass-and-play cover and the leave question.

import { onDestroy, onMount, untrack } from "svelte";
import { fade, fly, scale } from "svelte/transition";
import { t } from "$lib/i18n/i18n.svelte";
import { openHelp } from "$lib/stores/sheets.svelte";
import { settings } from "$lib/stores/settings.svelte";
import Sheet from "$lib/ui/Sheet.svelte";
import Button from "$lib/ui/Button.svelte";
import SuitText from "$lib/ui/SuitText.svelte";
import Bee from "$lib/brand/Bee.svelte";
import PlayingCard from "$lib/cards/PlayingCard.svelte";
import { MOMENTS } from "$lib/models/moments";
import { TableGame } from "./game.svelte";
import TableHeader from "./TableHeader.svelte";
import Seat from "./Seat.svelte";
import Trick from "./Trick.svelte";
import Hand from "./Hand.svelte";
import AuctionPanel from "./AuctionPanel.svelte";
import LobbyPanel from "./LobbyPanel.svelte";
import RoundResult from "./RoundResult.svelte";
import MatchEnd from "./MatchEnd.svelte";
import RoundReview from "./RoundReview.svelte";
import Reactions from "./Reactions.svelte";
import CoachPanel from "./CoachPanel.svelte";

;type $$ComponentProps =  { id: string; phase: "auction" | "online" | null };function $$render() {

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  let { id, phase }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();

  // The view is keyed by the table id, so the game is made once for its id.
  const game = untrack(() => new TableGame(id, phase));
  let layer: HTMLDivElement;
  let felt: HTMLDivElement;

  $effect(() => {
    if (phase !== game.phase) game.setPhase(phase);
  });

  // A coinche shakes the table (full effects only).
  $effect(() => {
    if (game.shake && settings.effects === "full" && felt) {
      felt.animate([{ transform: "translate(0,0)" }, { transform: "translate(-6px,2px) rotate(-0.4deg)" }, { transform: "translate(5px,-2px) rotate(0.3deg)" }, { transform: "translate(-3px,1px)" }, { transform: "translate(0,0)" }], { duration: 420, easing: "ease-out" });
    }
  });

  onMount(() => {
    game.anchors.layer = layer;
    game.load();
  });
  onDestroy(() => game.destroy());

  const placements = ["top", "left", "right"] as const;
  const seatAt = (placement: string) => game.seats.find((seat) => game.placement(seat.index) === placement);

  function openRules() {
    openHelp({ hint: game.hintAvailable ? () => game.askHint() : null });
  }
;
async () => {

 { svelteHTML.createElement("div", {   "class":`table-screen`,...__sveltets_2_empty({"data-stage":game.stage}),});
   { svelteHTML.createElement("h1", { "class":`visually-hidden`,});game.title; }
   { const $$_redaeHelbaT1C = __sveltets_2_ensureComponent(TableHeader); new $$_redaeHelbaT1C({ target: __sveltets_2_any(), props: {   game,"onRules":openRules,}});}

   { const $$_div1 = svelteHTML.createElement("div", {    "class":`felt`,"aria-label":t("Four-player card table"),});felt = $$_div1;
     { svelteHTML.createElement("div", {   "class":`ring`,"aria-hidden":`true`,}); }
       for(let placement of __sveltets_2_ensureArray(placements)){placement;
      const seat = seatAt(placement);
      if(seat && seat.name){
         { svelteHTML.createElement("div", { "class":`seat-slot ${placement}`,}); { const $$_taeS3C = __sveltets_2_ensureComponent(Seat); new $$_taeS3C({ target: __sveltets_2_any(), props: {   game,seat,placement,}});} }
      }
    }

     { const $$_div2 = svelteHTML.createElement("div", {  "class":`centre`,});game.anchors.centre = $$_div2;
      if(game.stage === "play"){
         { svelteHTML.createElement("span", {   "class":`trick-count`,"aria-hidden":`true`,});t("Trick {0} / 8", game.completedTricks); }
      }
       { const $$_kcirT3C = __sveltets_2_ensureComponent(Trick); new $$_kcirT3C({ target: __sveltets_2_any(), props: { game,}});}
      if(game.stage === "auction" && game.auction?.bidding.upturnedCard && !game.dealing){
        
         { svelteHTML.createElement("div", {     "class":`upturned-card`,"aria-hidden":`true`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: settings.effects === "full" ? -90 : 0, duration: 420, opacity: 0 })));
           { const $$_draCgniyalP4C = __sveltets_2_ensureComponent(PlayingCard); new $$_draCgniyalP4C({ target: __sveltets_2_any(), props: {  "card":game.auction.bidding.upturnedCard,}});}
         }
      }
      if(game.stage === "lobby"){
         { svelteHTML.createElement("div", {   "class":`lobby-art`,"aria-hidden":`true`,}); { const $$_eeB4C = __sveltets_2_ensureComponent(Bee); new $$_eeB4C({ target: __sveltets_2_any(), props: {  "size":`4rem`,}});} }
      }
     }

    if(game.botLine){
      const line = game.botLine;
      line.key; {
         { svelteHTML.createElement("p", {     "class":`bot-line ${game.placement(line.seat)}`,"aria-hidden":`true`,});__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('p'),({ start: 0.6, duration: 260 })));line.text; }
      }
    }

    if(game.celebration){
      const moment = game.celebration;
      moment.key; {
         { svelteHTML.createElement("div", {         "class":`celebration`,...__sveltets_2_empty({"data-kind":moment.kind}),"aria-hidden":`true`,});__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('div'),({ start: 0.3, duration: 520, easing: (x) => 1 - Math.pow(1 - x, 3) * Math.cos(x * 6) * 0.9 })));__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),({ duration: 220 })));
           { svelteHTML.createElement("strong", {});t(MOMENTS[moment.kind].text); }
          if(moment.chips.length){
             { svelteHTML.createElement("span", { "class":`moment-chips`,});    for(let chip of __sveltets_2_ensureArray(moment.chips)){let index = 1;index; { svelteHTML.createElement("span", {});chip.kind === "points" ? chip.text : t(chip.text); }} }
          }
         }
      }
    }

    if(game.toast){
      const toast = game.toast;
      toast.key; {
         { svelteHTML.createElement("div", {       "class":`toast ${toast.kind}`,"role":`status`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: -12, duration: 260 })));__sveltets_2_ensureTransition(fade(svelteHTML.mapElementTag('div'),({ duration: 160 }))); { const $$_txeTtiuS3C = __sveltets_2_ensureComponent(SuitText); new $$_txeTtiuS3C({ target: __sveltets_2_any(), props: {  "text":toast.text,}});} }
      }
    }

     { const $$_snoitcaeR2C = __sveltets_2_ensureComponent(Reactions); new $$_snoitcaeR2C({ target: __sveltets_2_any(), props: { game,}});}
   }

   { svelteHTML.createElement("div", { "class":`bottom`,});
    if(game.tutorial){
       { const $$_lenaPhcaoC2C = __sveltets_2_ensureComponent(CoachPanel); new $$_lenaPhcaoC2C({ target: __sveltets_2_any(), props: { game,}});}
    }
    if(game.stage === "auction" && game.auction){
       { const $$_lenaPnoitcuA2C = __sveltets_2_ensureComponent(AuctionPanel); new $$_lenaPnoitcuA2C({ target: __sveltets_2_any(), props: { game,}});}
    }
    if(game.declare || game.chips.length){
       { svelteHTML.createElement("div", {   "class":`chips`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: 10, duration: 240 })));
        if(game.declare){
           { svelteHTML.createElement("button", {         "class":`chip declare`,"type":`button`,"role":`switch`,"aria-checked":game.declareOn,"onclick":() => (game.declareOn = !game.declareOn),});
             { svelteHTML.createElement("span", {   "class":`tick`,"aria-hidden":`true`,});game.declareOn ? "✓" : ""; }game.declare.label;
           }
        }
           for(let chip of __sveltets_2_ensureArray(game.chips)){chip.id;
           { svelteHTML.createElement("button", {      "class":`chip`,"type":`button`,"onclick":() => game.pushToast(chip.detail, "detail"),});chip.scored;chip.text; }
        }
       }
    }
    if(game.seats.length && game.stage !== "lobby" && !(game.stage === "auction" && game.auction?.open)){
      const me = game.seats[game.viewer];
      if(me){ { svelteHTML.createElement("div", { "class":`me`,}); { const $$_taeS3C = __sveltets_2_ensureComponent(Seat); new $$_taeS3C({ target: __sveltets_2_any(), props: {     game,"seat":me,"placement":`bottom`,}});} }}
    }
     { const $$_dnaH2C = __sveltets_2_ensureComponent(Hand); new $$_dnaH2C({ target: __sveltets_2_any(), props: { game,}});}
   }

  if(game.stage === "lobby" && game.lobby){
     { const $$_lenaPybboL1C = __sveltets_2_ensureComponent(LobbyPanel); new $$_lenaPybboL1C({ target: __sveltets_2_any(), props: { game,}});}
  }
  if(game.round && game.stage === "play"){
     { const $$_tluseRdnuoR1C = __sveltets_2_ensureComponent(RoundResult); new $$_tluseRdnuoR1C({ target: __sveltets_2_any(), props: { game,}});}
  }
 }

 { const $$_div0 = svelteHTML.createElement("div", {    "class":`deal-layer`,"aria-hidden":`true`,});layer = $$_div0; }

if(game.matchEnd){
   { const $$_dnEhctaM0C = __sveltets_2_ensureComponent(MatchEnd); new $$_dnEhctaM0C({ target: __sveltets_2_any(), props: { game,}});}
}
if(game.review && game.snapshot?.board?.roundResult){
   { const $$_weiveRdnuoR0C = __sveltets_2_ensureComponent(RoundReview); new $$_weiveRdnuoR0C({ target: __sveltets_2_any(), props: { game,}});}
}

 { const $$_teehS0C = __sveltets_2_ensureComponent(Sheet); new $$_teehS0C({ target: __sveltets_2_any(), props: {       children:() => { return __sveltets_2_any(0); },"open":Boolean(game.handoff),"variant":`cover`,"dismissible":false,"labelledby":`handoff-title`,}});
   { svelteHTML.createElement("div", { "class":`handoff`,});
     { const $$_eeB2C = __sveltets_2_ensureComponent(Bee); new $$_eeB2C({ target: __sveltets_2_any(), props: {  "size":`4.5rem`,}});}
     { svelteHTML.createElement("p", { "class":`eyebrow`,});t("Pass and play"); }
     { svelteHTML.createElement("h2", { "id":`handoff-title`,});t("Pass the device to {0}", game.handoff?.name ?? ""); }
     { svelteHTML.createElement("p", {});t("Keep your cards hidden from the other players."); }
     { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"size":`lg`,"onclick":() => game.handoffReady(),}});t("I'm ready"); Button}
   }
 Sheet}

 { const $$_teehS0C = __sveltets_2_ensureComponent(Sheet); const $$_teehS0 = new $$_teehS0C({ target: __sveltets_2_any(), props: {        children:() => { return __sveltets_2_any(0); },open:game.leave.open,"variant":`dialog`,"labelledby":`leave-title`,"describedby":`leave-message`,}});/*Ωignore_startΩ*/() => game.leave.open = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_teehS0.$$bindings = 'open';
   { svelteHTML.createElement("div", { "class":`leave`,});
     { svelteHTML.createElement("h2", { "id":`leave-title`,});game.leave.title; }
     { svelteHTML.createElement("p", { "id":`leave-message`,});game.leave.message; }
     { svelteHTML.createElement("div", { "class":`leave-actions`,});
       { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: { children:() => { return __sveltets_2_any(0); },"onclick":() => (game.leave.open = false),}});t("Stay"); Button}
       { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"variant":`danger`,"onclick":() => game.confirmLeave(),}});t("Leave"); Button}
     }
   }
 Sheet}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const TableView__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type TableView__SvelteComponent_ = ReturnType<typeof TableView__SvelteComponent_>;
/*Ωignore_endΩ*/export default TableView__SvelteComponent_;