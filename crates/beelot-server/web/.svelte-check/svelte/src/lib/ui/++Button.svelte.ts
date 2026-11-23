///<reference types="svelte" />
;// The one button of the app: a link when it has `href`, a button otherwise. Primary is honey with a glow and is the one
// main action of a screen; secondary is glass; ghost is text; danger is coral. It presses in on a spring.

import type { Snippet } from "svelte";
import type { HTMLButtonAttributes } from "svelte/elements";
import { sfx } from "$lib/audio/sfx";
;

  interface Props extends Omit<HTMLButtonAttributes, "children"> {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "lg" | "md" | "sm";
    href?: string;
    download?: boolean | string;
    block?: boolean;
    busy?: boolean;
    sound?: boolean;
    class?: string;
    element?: HTMLElement | null;
    children: Snippet;
  };function $$render() {

  
  
  
  
  


  let {
    variant = "primary",
    size = "md",
    href,
    download,
    block = false,
    busy = false,
    sound = variant === "primary",
    class: extra = "",
    element = $bindable(null),
    children,
    onclick,
    ...rest
  }: Props = $props()/*Ωignore_startΩ*/;element;/*Ωignore_endΩ*/;

  function tap(event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
    if (sound) sfx.play("tap");
    onclick?.(event);
  }
;
async () => {

if(href){
   { const $$_a0 = svelteHTML.createElement("a", {          href,download,"class":`btn ${variant} ${size} ${extra}`,"onclick":() => sound && sfx.play("tap"),"aria-disabled":rest.disabled ? "true" : undefined,...rest as any,});element = $$_a0;block;
    ;__sveltets_2_ensureSnippet(children());
   }
}else{
   { const $$_button0 = svelteHTML.createElement("button", {             "type":`button`,"class":`btn ${variant} ${size} ${extra}`,"disabled":rest.disabled || busy,"aria-busy":busy || undefined,"onclick":tap,...rest,});element = $$_button0;block;busy;
    ;__sveltets_2_ensureSnippet(children());
   }
}


};
return { props: {} as any as Props, exports: {}, bindings: __sveltets_$$bindings('element'), slots: {}, events: {} }}
const Button__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Button__SvelteComponent_ = ReturnType<typeof Button__SvelteComponent_>;
/*Ωignore_endΩ*/export default Button__SvelteComponent_;