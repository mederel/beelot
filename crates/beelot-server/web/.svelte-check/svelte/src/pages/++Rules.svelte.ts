///<reference types="svelte" />
;// The rules reference (US-123): the same text in the help sheet and at /rules. `order` puts the card order first.

import { t } from "$lib/i18n/i18n.svelte";
import PlayingCard from "$lib/cards/PlayingCard.svelte";
function $$render() {

  
  
  

  const trumpOrder = ["J", "9", "A", "10", "K", "Q", "8", "7"];
  const plainOrder = ["A", "10", "K", "Q", "J", "9", "8", "7"];
;
async () => {

 { svelteHTML.createElement("div", { "class":`rules`,});
   { svelteHTML.createElement("section", { "class":`order`,});
     { svelteHTML.createElement("h3", {});t("Card order"); }
     { svelteHTML.createElement("p", {});t("At trump: jack, 9, ace, 10, king, queen, 8, 7. In other suits: ace, 10, king, queen, jack, 9, 8, 7."); }
     { svelteHTML.createElement("div", {   "class":`strip`,"aria-hidden":`true`,});
         for(let rank of __sveltets_2_ensureArray(trumpOrder)){rank; { const $$_draCgniyalP3C = __sveltets_2_ensureComponent(PlayingCard); new $$_draCgniyalP3C({ target: __sveltets_2_any(), props: {    "card":{ rank, suit: "HEARTS" },"label":false,}});}}
     }
     { svelteHTML.createElement("div", {   "class":`strip`,"aria-hidden":`true`,});
         for(let rank of __sveltets_2_ensureArray(plainOrder)){rank; { const $$_draCgniyalP3C = __sveltets_2_ensureComponent(PlayingCard); new $$_draCgniyalP3C({ target: __sveltets_2_any(), props: {    "card":{ rank, suit: "SPADES" },"label":false,}});}}
     }
   }
   { svelteHTML.createElement("p", { "class":`lead`,});t("Classic suit-trump Belote, played to 1,000 points. Tout-Atout and Sans-Atout are not part of this variant."); }
   { svelteHTML.createElement("section", {});
     { svelteHTML.createElement("h3", {});t("Deal and trump"); }
     { svelteHTML.createElement("p", {});t("Each player receives five cards and one card is turned face up. First, accept that suit or pass. After all pass, choose another suit; a second all-pass redeals."); }
   }
   { svelteHTML.createElement("section", {});
     { svelteHTML.createElement("h3", {});t("Announcements"); }
     { svelteHTML.createElement("p", {});t("Declare tierce (three cards in a row, 20), cinquante (four, 50), cent (five or more, 100) and carrés (jacks 200, nines 150, aces, tens, kings or queens 100) when you play your first card. Sequences follow 7, 8, 9, 10, jack, queen, king, ace in one suit; a card counts once, carrés first. Only the team with the best announcement scores, and it scores all of its own: the higher value wins, then the longer run, then the higher card, then trump, then whoever declared first. Belote and announcements count towards the contract."); }
   }
   { svelteHTML.createElement("section", {});
     { svelteHTML.createElement("h3", {});t("Playing a card"); }
     { svelteHTML.createElement("p", {});t("Follow the lead suit when possible. If void and an opponent wins, trump and overtrump when able. If your partner wins, you may discard."); }
   }
   { svelteHTML.createElement("section", {});
     { svelteHTML.createElement("h3", {});t("Scoring"); }
     { svelteHTML.createElement("p", {});t("Card points total 162, including 10 points for the last trick (Dix de der). King and queen of trump declare Belote/Rebelote for 20 points. The declaring team must score more than its opponents, counting Belote and announcements."); }
     { svelteHTML.createElement("p", {});t("A team that takes every trick makes a capot and scores 250 instead of 162. In Contrée, the bid is added to the team that wins the contract: the bidders if they make it, their opponents if they fail."); }
     { svelteHTML.createElement("p", {});t("The first team to reach the match target (1,000 points in Classic Belote and 2,000 in Contrée, unless the players choose 500, 1,000, 1,500 or 2,000) wins the match. When both teams reach it in the same round, the higher score wins; an exact tie is settled by another round."); }
   }
   { svelteHTML.createElement("section", {});
     { svelteHTML.createElement("h3", {});t("Contrée variant"); }
     { svelteHTML.createElement("p", {});t("All eight cards are dealt before an auction from 80 to 160, in steps of 10. Each call names a trump suit and must raise the current contract. Three passes after a bid close the auction. An opponent may coinche, doubling the round score; Belote/Rebelote remains active."); }
   }
   { svelteHTML.createElement("section", {});
     { svelteHTML.createElement("h3", {});t("Tout-atout and sans-atout"); }
     { svelteHTML.createElement("p", {});t("Besides the four suits, a Contrée bid can name sans-atout (no trumps) or tout-atout (all trumps) when the table plays them. A bid must be higher in value whatever the contract. Nothing is cut in either contract: follow the lead suit when you can, otherwise play any card. In tout-atout you must also beat the winning card when you can."); }
     { svelteHTML.createElement("p", {});t("Sans-atout card points: Ace 19, 10 10, King 4, Queen 3, Jack 2, 9, 8 and 7 0. Order: ace, 10, king, queen, jack, 9, 8, 7. The cards total 162 with the 10 points for the last trick (Dix de der)."); }
     { svelteHTML.createElement("p", {});t("Tout-atout card points: Jack 13, 9 9, Ace 6, 10 5, King 3, Queen 2, 8 and 7 0. Order in every suit: jack, 9, ace, 10, king, queen, 8, 7. The cards total 162 with the 10 points for the last trick (Dix de der)."); }
     { svelteHTML.createElement("p", {});t("In tout-atout, Belote/Rebelote can be declared in every suit; sans-atout has none. Sans-atout carrés score aces 200, tens 150, and kings, queens, jacks or nines 100."); }
   }
 }


};
return { props: {} as Record<string, never>, exports: {}, bindings: "", slots: {}, events: {} }}
const Rules__SvelteComponent_ = __sveltets_2_isomorphic_component(__sveltets_2_with_any_event($$render()));
/*Ωignore_startΩ*/type Rules__SvelteComponent_ = InstanceType<typeof Rules__SvelteComponent_>;
/*Ωignore_endΩ*/export default Rules__SvelteComponent_;