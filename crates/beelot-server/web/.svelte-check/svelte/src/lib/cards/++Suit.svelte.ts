///<reference types="svelte" />
;// THE suit symbol: an inline SVG we draw (suit-shapes.ts), never a font character. `suit` is CLUBS, DIAMONDS, HEARTS or
// SPADES in any case. It is hidden from screen readers: the suit's name is always written next to it (or in the label of
// the card or button that holds it), so nothing is read twice.

import { SUIT_SHAPES, suitKey } from "./suit-shapes";

;type $$ComponentProps =  { suit: string; class?: string };function $$render() {

  
  
  
  

  let { suit, class: extra = "" }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
  const key = $derived(suitKey(suit));
  const shape = $derived(SUIT_SHAPES[key]);
;
async () => {

 { svelteHTML.createElement("svg", {         "class":`suit ${extra}`,"viewBox":`0 0 100 100`,"aria-hidden":`true`,"focusable":`false`,...__sveltets_2_empty({"data-suit":key}),});
      for(let [cx, cy, r] of __sveltets_2_ensureArray(shape.lobes)){let index = 1;index;
     { svelteHTML.createElement("circle", {      ...__sveltets_2_empty({"data-lobe":true}),"cx":cx,"cy":cy,"r":r,});}
  }
   { svelteHTML.createElement("path", {  ...__sveltets_2_empty({"data-body":true}),"d":shape.path,});}
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Suit__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Suit__SvelteComponent_ = ReturnType<typeof Suit__SvelteComponent_>;
/*Ωignore_endΩ*/export default Suit__SvelteComponent_;