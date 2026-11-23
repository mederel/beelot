///<reference types="svelte" />
;// The other three hands, face up (US-199): a tutorial shows every card so that the coach can say why one is played and not
// another. Three small fans side by side, each under its player's name, so they fit a phone's width.

import { cardName, playerName, t } from "$lib/i18n/i18n.svelte";
import { cardKey } from "$lib/models/card-physics";
import PlayingCard from "$lib/cards/PlayingCard.svelte";
import type { TableGame } from "./game.svelte";

;type $$ComponentProps =  { game: TableGame };function $$render() {

  
  
  
  
  
  

  let { game }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();

  const others = $derived(
    game.openHands
      ? [1, 2, 3].map((offset) => {
          const index = (game.viewer + offset) % 4;
          return { index, name: playerName(game.seats[index]?.name), cards: game.openHands![index] ?? [] };
        })
      : []
  );
;
async () => {

if(others.length){
   { svelteHTML.createElement("div", {     "class":`open-hands`,"role":`group`,"aria-label":t("The other players' cards, face up"),});
       for(let other of __sveltets_2_ensureArray(others)){other.index;
       { svelteHTML.createElement("div", { "class":`mini`,});
         { svelteHTML.createElement("span", { "class":`who`,});other.name; }
         { svelteHTML.createElement("span", {   "class":`fan`,"aria-hidden":`true`,});
             for(let card of __sveltets_2_ensureArray(other.cards)){cardKey(card); { svelteHTML.createElement("span", { "class":`card`,}); { const $$_draCgniyalP4C = __sveltets_2_ensureComponent(PlayingCard); new $$_draCgniyalP4C({ target: __sveltets_2_any(), props: {   card,"label":false,}});} }}
         }
         { svelteHTML.createElement("span", { "class":`visually-hidden`,});other.name; other.cards.map(cardName).join(", "); }
       }
    }
   }
}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const OpenHands__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type OpenHands__SvelteComponent_ = ReturnType<typeof OpenHands__SvelteComponent_>;
/*Ωignore_endΩ*/export default OpenHands__SvelteComponent_;