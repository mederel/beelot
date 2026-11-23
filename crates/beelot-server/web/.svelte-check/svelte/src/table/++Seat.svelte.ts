///<reference types="svelte" />
;// A seat at the table: the avatar (a bot's face changes with the game, US-088), the name and team, the cards left, the
// dealer token (it slides to the next dealer, US-097), the contract badge, the latest call and the thinking dots.

import { fly, scale } from "svelte/transition";
import { localized, playerName, suitName, t } from "$lib/i18n/i18n.svelte";
import { callKind } from "$lib/models/contract-badge";
import { settings } from "$lib/stores/settings.svelte";
import Avatar from "$lib/avatars/Avatar.svelte";
import SuitText from "$lib/ui/SuitText.svelte";
import type { Placement, SeatView, TableGame } from "./game.svelte";

;type $$ComponentProps =  { game: TableGame; seat: SeatView; placement: Placement };function $$render() {

  
  
  
  
  
  
  
  
  

  let { game, seat, placement }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();

  let avatar: HTMLElement;
  $effect(() => {
    game.anchors.seats.set(seat.index, avatar);
    return () => {
      if (game.anchors.seats.get(seat.index) === avatar) game.anchors.seats.delete(seat.index);
    };
  });

  const mine = $derived(game.contract?.player === seat.name ? game.contract : null);
  const contractText = $derived(mine ? (mine.value == null ? suitName(mine.suit, false) : `${mine.value} ${suitName(mine.suit, false)}`) : "");
  const count = $derived(localized({ code: "cards-count", params: { count: seat.cardCount } }));
  const label = $derived(
    t("{0}, {1}, {2}{3}", playerName(seat.name), t(seat.team), count, seat.active ? t(", active player") : "") +
      (mine ? t(", contract {0}", contractText) + (mine.coinched ? t(", coinched") : "") : "")
  );
  const kind = $derived(callKind(seat.call));
  const self = $derived(placement === "bottom");
  const shownName = $derived(self && seat.name !== "You" ? t("{0} · You", playerName(seat.name)) : playerName(seat.name));
  const red = (text: string) => /cœur|carreau|hearts|diamonds|harten|ruiten/i.test(text);

  // The dealer token flies from the previous dealer's seat (US-097).
  function dealerToken(node: HTMLElement) {
    const from = game.anchors.seats.get((seat.index + 3) % 4);
    if (settings.effects === "off" || !from || game.stage === "lobby") return;
    if (settings.effects === "reduced") {
      node.animate({ opacity: [0, 1] }, { duration: 200 });
      return;
    }
    const start = from.getBoundingClientRect();
    const end = node.getBoundingClientRect();
    if (!start.width || !end.width) return;
    node.animate([{ transform: `translate(${start.left - end.left}px, ${start.top - end.top}px) scale(1.3)` }, { transform: "none" }], { duration: 650, easing: "cubic-bezier(.3,.8,.3,1.15)" });
  }
;
async () => {

 { svelteHTML.createElement("div", {        "class":`seat ${placement}`,"role":`group`,"aria-label":label,...__sveltets_2_empty({"data-team":seat.index % 2}),});seat.active;self;
   { const $$_div1 = svelteHTML.createElement("div", {  "class":`avatar-wrap`,});avatar = $$_div1;
     { svelteHTML.createElement("span", {   "class":`halo`,"aria-hidden":`true`,}); }
     { const $$_ratavA2C = __sveltets_2_ensureComponent(Avatar); new $$_ratavA2C({ target: __sveltets_2_any(), props: {        "name":seat.name,"expression":game.expressions[seat.index] ?? "neutral","team":seat.index % 2,"size":self ? "2.4rem" : "3rem",}});}
    if(seat.dealer){
       {const $$action_0 = __sveltets_2_ensureAction(dealerToken(svelteHTML.mapElementTag('span')));{ svelteHTML.createElement("span", __sveltets_2_union($$action_0), {        "class":`dealer hex`,"title":t("Dealer"),"aria-label":t("Dealer"),"role":`img`,});  }}
    }
    if(seat.thinking || (seat.active && game.stage === "play" && !self && game.trickWinner === null && !game.round && !game.dealing)){
       { svelteHTML.createElement("span", {     "class":`thinking`,"aria-hidden":`true`,});__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('span'),({ duration: 200 }))); { svelteHTML.createElement("i", {}); } { svelteHTML.createElement("i", {}); } { svelteHTML.createElement("i", {}); } }
    }
   }
   { svelteHTML.createElement("div", { "class":`details`,});
     { svelteHTML.createElement("strong", { "class":`name`,});shownName; }
    if(game.stage !== "lobby"){ { svelteHTML.createElement("small", { "class":`meta`,});t(seat.team);  count; }}
   }
  if(mine){
    game.contractBounce; {
       { svelteHTML.createElement("span", {      "class":`badge`,"aria-hidden":`true`,});red(contractText);__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('span'),({ start: settings.effects === "full" ? 0.4 : 1, duration: 420, opacity: 0.4 })));
          { const $$_txeTtiuS2C = __sveltets_2_ensureComponent(SuitText); new $$_txeTtiuS2C({ target: __sveltets_2_any(), props: {  "text":contractText,"symbolOnly":true,}});}if(mine.coinched){ { svelteHTML.createElement("em", {});  }}
       }
    }
  }
  if(seat.call && game.stage === "auction"){
    seat.callFresh; {
       { svelteHTML.createElement("span", {        "class":`call`,...__sveltets_2_empty({"data-kind":kind}),"aria-hidden":`true`,});seat.stale;__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('span'),({ y: 10, duration: settings.effects === "full" ? 380 : 0, opacity: 0 })));
          { const $$_txeTtiuS2C = __sveltets_2_ensureComponent(SuitText); new $$_txeTtiuS2C({ target: __sveltets_2_any(), props: {  "text":localized(seat.call),"symbolOnly":true,}});}
       }
    }
  }
  if(!self && seat.cardCount > 0 && game.stage !== "lobby"){
     { svelteHTML.createElement("span", {   "class":`backs`,"aria-hidden":`true`,});
          for(let _ of __sveltets_2_ensureArray((Array.from({ length: Math.min(seat.cardCount, 8) })))){let index = 1;index; { svelteHTML.createElement("i", {  });__sveltets_2_ensureType(String, Number, index);__sveltets_2_ensureType(String, Number, Math.min(seat.cardCount, 8)); }}
     }
  }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Seat__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Seat__SvelteComponent_ = ReturnType<typeof Seat__SvelteComponent_>;
/*Ωignore_endΩ*/export default Seat__SvelteComponent_;