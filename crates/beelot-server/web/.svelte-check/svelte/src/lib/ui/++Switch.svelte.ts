///<reference types="svelte" />
;// An on/off setting: a button with role="switch", its label and an optional line under it.

import { sfx } from "$lib/audio/sfx";

;type $$ComponentProps =  { checked: boolean; label: string; hint?: string; onchange?: (on: boolean) => void; id?: string };function $$render() {

  
  
  let { checked = $bindable(), label, hint = "", onchange, id }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props()/*Ωignore_startΩ*/;checked;/*Ωignore_endΩ*/;
  function toggle() {
    checked = !checked;
    sfx.play("toggle");
    onchange?.(checked);
  }
;
async () => {

 { svelteHTML.createElement("div", { "class":`row`,});
   { svelteHTML.createElement("span", { "class":`text`,});
     { svelteHTML.createElement("strong", {});label; }
    if(hint){ { svelteHTML.createElement("small", {});hint; }}
   }
   { svelteHTML.createElement("button", {             id,"type":`button`,"role":`switch`,"aria-checked":checked,"aria-label":label,"class":`switch`,"onclick":toggle,});checked; { svelteHTML.createElement("span", { "class":`knob`,}); } }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('checked'), slots: {}, events: {} }}
const Switch__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Switch__SvelteComponent_ = ReturnType<typeof Switch__SvelteComponent_>;
/*Ωignore_endΩ*/export default Switch__SvelteComponent_;