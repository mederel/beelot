///<reference types="svelte" />
;// The wordmark: the bee and "beelot" in Bricolage, honey on night. Live text, so it is crisp at every size.

import Bee from "./Bee.svelte";

;type $$ComponentProps =  { size?: "sm" | "md" | "lg" };function $$render() {

  
  
  let { size = "md" }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
;
async () => {

 { svelteHTML.createElement("span", { "class":`logo ${size}`,});
   { const $$_eeB1C = __sveltets_2_ensureComponent(Bee); new $$_eeB1C({ target: __sveltets_2_any(), props: {    "size":`1.35em`,"flutter":size === "lg",}});}
   { svelteHTML.createElement("span", { "class":`word`,});  }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Logo__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Logo__SvelteComponent_ = ReturnType<typeof Logo__SvelteComponent_>;
/*Ωignore_endΩ*/export default Logo__SvelteComponent_;