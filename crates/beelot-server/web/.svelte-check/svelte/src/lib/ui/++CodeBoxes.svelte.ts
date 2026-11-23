///<reference types="svelte" />
;// The six boxes of an invitation code (US-124): one character each, a paste spreads over the boxes, Backspace in an
// empty box goes back.

import { t } from "$lib/i18n/i18n.svelte";
import { boxAfterBackspace, CODE_LENGTH, joinedCode, normalizeCode, spreadCode } from "$lib/models/small";

;type $$ComponentProps =  { value: string; labelledby: string };function $$render() {

  
  
  
  

  let { value = $bindable(""), labelledby }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props()/*Ωignore_startΩ*/;value;/*Ωignore_endΩ*/;
  let boxes = $state(Array.from({ length: CODE_LENGTH }, () => ""));
  const inputs: HTMLInputElement[] = [];

  function input(index: number, event: Event) {
    const typed = normalizeCode((event.currentTarget as HTMLInputElement).value);
    // The boxes as they are on screen: a character just deleted from this one is gone, and stays gone.
    boxes = spreadCode(
      inputs.map((box) => box?.value ?? ""),
      index,
      typed
    );
    for (let i = 0; i < CODE_LENGTH; i += 1) if (inputs[i]) inputs[i].value = boxes[i];
    value = joinedCode(boxes);
    inputs[typed ? Math.min(index + typed.length, CODE_LENGTH - 1) : index]?.focus();
  }

  function keydown(index: number, event: KeyboardEvent) {
    if (event.key !== "Backspace") return;
    const target = boxAfterBackspace(index, boxes);
    if (target !== index) {
      event.preventDefault();
      inputs[target]?.focus();
    }
  }
;
async () => {

 { svelteHTML.createElement("div", {     "class":`boxes`,"role":`group`,"aria-labelledby":labelledby,});
      for(let box of __sveltets_2_ensureArray(boxes)){let index = 1;index;
     { const $$_input1 = svelteHTML.createElement("input", {                        "class":`box`,"type":`text`,"maxlength":CODE_LENGTH,"required":true,"autocomplete":`off`,"autocapitalize":`characters`,"inputmode":`text`,"aria-label":t("Character {0} of 6", index + 1),"value":box,"oninput":(event) => input(index, event),"onkeydown":(event) => keydown(index, event),});inputs[index] = $$_input1;box !== "";}
  }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('value'), slots: {}, events: {} }}
const CodeBoxes__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type CodeBoxes__SvelteComponent_ = ReturnType<typeof CodeBoxes__SvelteComponent_>;
/*Ωignore_endΩ*/export default CodeBoxes__SvelteComponent_;