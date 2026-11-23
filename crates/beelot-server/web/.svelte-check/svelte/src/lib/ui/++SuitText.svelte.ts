///<reference types="svelte" />
;// Text with a drawn suit symbol (never a font character) before each suit name ("80 [heart] Hearts"). With `symbolOnly`
// the name stays for screen readers but is hidden on screen. A suit is never smaller than 16px, so it reads on a phone.

import { suitWordMap } from "$lib/i18n/i18n.svelte";
import { splitSuitText } from "$lib/models/suit-text";
import Suit from "$lib/cards/Suit.svelte";

;type $$ComponentProps =  { text: string; symbolOnly?: boolean };function $$render() {

  
  
  
  
  

  let { text, symbolOnly = false }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
  const parts = $derived(splitSuitText(text, suitWordMap()));
;
async () => {

    for(let part of __sveltets_2_ensureArray(parts)){let index = 1;index;if(typeof part === "string"){part;}else{ { svelteHTML.createElement("span", {  "class":`suit-word`,});part.suit === "hearts" || part.suit === "diamonds"; { const $$_tiuS1C = __sveltets_2_ensureComponent(Suit); new $$_tiuS1C({ target: __sveltets_2_any(), props: {  "suit":part.suit,}});}if(symbolOnly){ { svelteHTML.createElement("span", { "class":`visually-hidden`,});part.word; }}else{ { svelteHTML.createElement("span", {}); part.word; }} }}}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const SuitText__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type SuitText__SvelteComponent_ = ReturnType<typeof SuitText__SvelteComponent_>;
/*Ωignore_endΩ*/export default SuitText__SvelteComponent_;