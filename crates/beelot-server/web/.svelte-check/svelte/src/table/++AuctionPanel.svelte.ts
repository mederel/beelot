///<reference types="svelte" />
;// The auction (US-120): a panel over the bottom of the table for the player's own call. Classic Belote takes or passes
// the upturned card, then chooses another trump; Contrée bids a value and a contract, and may coinche. Every disabled
// choice says why in the line under the buttons; a hint lights the call the Challenging bot would make (US-065).

import { fly } from "svelte/transition";
import { localized, playerName, suitName, t } from "$lib/i18n/i18n.svelte";
import { settings } from "$lib/stores/settings.svelte";
import Button from "$lib/ui/Button.svelte";
import SuitText from "$lib/ui/SuitText.svelte";
import Suit from "$lib/cards/Suit.svelte";
import PlayingCard from "$lib/cards/PlayingCard.svelte";
import type { TableGame } from "./game.svelte";

;type $$ComponentProps =  { game: TableGame };function $$render() {

  
  
  
  
  
  
  
  
  
  
  

  let { game }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
  const auction = $derived(game.auction!);
  const model = $derived(auction.model);

  let value = $state<number | null>(null);
  let suit = $state<string | null>(null);

  // One legal choice stays selected: the lowest value open, the first suit open; a hint chooses for the player.
  $effect(() => {
    const values = model.values ?? [];
    if (value === null || values.find((item) => item.value === value)?.disabled) value = values.find((item) => !item.disabled)?.value ?? model.bid?.value ?? null;
    const suits = model.suits;
    if (suit === null || suits.find((item) => item.suit === suit)?.disabled !== false) suit = suits.find((item) => !item.disabled)?.suit ?? model.bid?.suit ?? null;
  });
  $effect(() => {
    const hint = game.hintBid;
    if (hint?.type === "contract") {
      value = hint.value ?? value;
      suit = hint.suit ?? suit;
    }
  });

  const hint = $derived(game.hintBid);
  const hintOn = (kind: string, choice?: string) =>
    Boolean(hint) && (hint!.type === kind || (kind === "take" && hint!.type === "trump" && model.mode === "take")) && (choice === undefined || hint!.suit === choice);
  const disabled = $derived(auction.busy);
  const contractName = (key: string) => (key === "NO_TRUMPS" || key === "ALL_TRUMPS" ? t(key === "NO_TRUMPS" ? "No trumps" : "All trumps") : suitName(key));
  const isRed = (key: string) => key === "HEARTS" || key === "DIAMONDS";
  const title = $derived(model.titleSuit ? t(model.title, suitName(model.titleSuit)) : t(model.title));
;
async () => {

if(auction.open){
   { svelteHTML.createElement("section", {     "class":`auction glass`,"aria-labelledby":`auction-title`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('section'),({ y: settings.effects === "full" ? 240 : 0, duration: 380, opacity: 0 })));
     { svelteHTML.createElement("div", { "class":`head`,});
       { svelteHTML.createElement("h2", { "id":`auction-title`,}); { const $$_txeTtiuS3C = __sveltets_2_ensureComponent(SuitText); new $$_txeTtiuS3C({ target: __sveltets_2_any(), props: {  "text":title,}});} }
      if(auction.upturned){
         { svelteHTML.createElement("div", {   "class":`upturned`,"aria-label":t("Upturned card"),}); { const $$_draCgniyalP3C = __sveltets_2_ensureComponent(PlayingCard); new $$_draCgniyalP3C({ target: __sveltets_2_any(), props: {  "card":auction.upturned,}});} }
      }
     }

    if(model.history.length){
       { svelteHTML.createElement("ol", {   "class":`history`,"aria-label":t("Bidding so far"),});
            for(let entry of __sveltets_2_ensureArray(model.history)){let index = 1;index;
           { svelteHTML.createElement("li", {}); { svelteHTML.createElement("span", {});playerName(entry.playerName); }  { const $$_txeTtiuS3C = __sveltets_2_ensureComponent(SuitText); new $$_txeTtiuS3C({ target: __sveltets_2_any(), props: {  "text":localized(entry.callCode, entry.call ?? ""),"symbolOnly":true,}});} }
        }
       }
    }

    if(model.values){
       { svelteHTML.createElement("div", {     "class":`values`,"role":`radiogroup`,"aria-label":t("Contract value"),});
           for(let item of __sveltets_2_ensureArray(model.values)){item.value;
           { svelteHTML.createElement("label", {  "class":`value`,});value === item.value;
             { svelteHTML.createElement("input", {            "type":`radio`,"name":`auction-value`,"value":item.value,"checked":value === item.value,"disabled":item.disabled || disabled,"onchange":() => (value = item.value),});}
             { svelteHTML.createElement("span", {});item.value; }
           }
        }
       }
    }

    if(model.mode === "bid"){
       { svelteHTML.createElement("div", {     "class":`suits`,"role":`radiogroup`,"aria-label":t("Trump suit"),});
           for(let item of __sveltets_2_ensureArray(model.suits)){item.suit;
           { svelteHTML.createElement("label", {    "class":`suit`,});suit === item.suit;isRed(item.suit);item.suit === "NO_TRUMPS" || item.suit === "ALL_TRUMPS";
             { svelteHTML.createElement("input", {            "type":`radio`,"name":`auction-suit`,"value":item.suit,"checked":suit === item.suit,"disabled":item.disabled || disabled,"onchange":() => (suit = item.suit),});}
            if(item.suit === "NO_TRUMPS" || item.suit === "ALL_TRUMPS"){ { svelteHTML.createElement("span", { "class":`word`,});contractName(item.suit); }}else{ { const $$_tiuS3C = __sveltets_2_ensureComponent(Suit); new $$_tiuS3C({ target: __sveltets_2_any(), props: {  "suit":item.suit,}});} { svelteHTML.createElement("span", { "class":`visually-hidden`,});contractName(item.suit); }}
           }
        }
       }
    }

    if(model.mode === "suit"){
       { svelteHTML.createElement("div", { "class":`trumps`,});
           for(let item of __sveltets_2_ensureArray(model.suits)){item.suit;
           { svelteHTML.createElement("button", {         "type":`button`,"class":`trump`,"disabled":item.disabled || disabled,"onclick":() => game.bid("trump", { suit: item.suit }),});isRed(item.suit);hintOn("trump", item.suit);
             { const $$_tiuS3C = __sveltets_2_ensureComponent(Suit); new $$_tiuS3C({ target: __sveltets_2_any(), props: {  "suit":item.suit,}});} { svelteHTML.createElement("span", {});contractName(item.suit); }
           }
        }
       }
    }

     { svelteHTML.createElement("p", {   "class":`reason`,"id":`auction-reason`,}); { const $$_txeTtiuS2C = __sveltets_2_ensureComponent(SuitText); new $$_txeTtiuS2C({ target: __sveltets_2_any(), props: {  "text":auction.reason,}});} }
    if(game.hintReason){ { svelteHTML.createElement("p", {   "class":`hint-reason`,"role":`status`,}); { const $$_txeTtiuS2C = __sveltets_2_ensureComponent(SuitText); new $$_txeTtiuS2C({ target: __sveltets_2_any(), props: {  "text":game.hintReason,}});} }}

     { svelteHTML.createElement("div", { "class":`actions`,});
       { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {         children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"class":hintOn("pass") ? "hinted" : "","disabled":model.pass.disabled || disabled,"aria-describedby":`auction-reason`,"onclick":() => game.bid("pass"),}});t("Pass"); Button}
      if(model.take){
         { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {       children:() => { return __sveltets_2_any(0); },"class":hintOn("take") ? "hinted" : "","disabled":model.take.disabled || disabled,"aria-describedby":`auction-reason`,"onclick":() => game.bid("trump", { suit: model.take!.suit! }),}});
           { const $$_txeTtiuS3C = __sveltets_2_ensureComponent(SuitText); new $$_txeTtiuS3C({ target: __sveltets_2_any(), props: {  "text":t("Take {0}", suitName(model.take.suit)),}});}
         Button}
      }
      if(model.bid){
         { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {       children:() => { return __sveltets_2_any(0); },"class":hintOn("contract") ? "hinted" : "","disabled":model.bid.disabled || disabled || value === null || suit === null,"aria-describedby":`auction-reason`,"onclick":() => game.bid("contract", { value: value!, suit: suit! }),}});
           { const $$_txeTtiuS3C = __sveltets_2_ensureComponent(SuitText); new $$_txeTtiuS3C({ target: __sveltets_2_any(), props: {  "text":t("Bid {0}", `${value} ${contractName(suit ?? "")}`),}});}
         Button}
      }
      if(model.coinche.shown){
         { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {         children:() => { return __sveltets_2_any(0); },"variant":`danger`,"class":hintOn("coinche") ? "hinted" : "","disabled":model.coinche.disabled || disabled,"aria-describedby":`auction-reason`,"onclick":() => game.bid("coinche"),}});t("Coinche"); Button}
      }
     }
   }
}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const AuctionPanel__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type AuctionPanel__SvelteComponent_ = ReturnType<typeof AuctionPanel__SvelteComponent_>;
/*Ωignore_endΩ*/export default AuctionPanel__SvelteComponent_;