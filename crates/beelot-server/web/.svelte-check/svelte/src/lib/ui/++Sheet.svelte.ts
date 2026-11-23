///<reference types="svelte" />
;// A sheet on a native <dialog>: a bottom sheet on phones, a centred panel from 720 px. The browser traps the focus and
// makes the page behind inert. It closes with Escape, a tap on the backdrop, the close button or a drag down on the
// grabber, unless `dismissible` is false (the pass-and-play cover). With `backCloses`, opening it adds a history entry,
// so the Back button closes it before it leaves the page (US-118). `onclose(reason)` says why it closed.

import type { Snippet } from "svelte";
import { X } from "@lucide/svelte";
import { t } from "$lib/i18n/i18n.svelte";
import { onBeforeNavigate, onPopState } from "$lib/stores/router.svelte";
import { settings } from "$lib/stores/settings.svelte";
;

  type Reason = "closed" | "back" | "navigated";;;

  interface Props {
    open: boolean;
    label?: string;
    labelledby?: string;
    describedby?: string;
    dismissible?: boolean;
    backCloses?: boolean;
    closeButton?: boolean;
    variant?: "sheet" | "dialog" | "cover";
    wide?: boolean;
    class?: string;
    onclose?: (reason: Reason) => void;
    children: Snippet;
  };function $$render() {

  
  
  
  
  
  
  
  
  



  let {
    open = $bindable(),
    label,
    labelledby,
    describedby,
    dismissible = true,
    backCloses = false,
    closeButton = true,
    variant = "sheet",
    wide = false,
    class: extra = "",
    onclose,
    children
  }: Props = $props()/*Ωignore_startΩ*/;open;/*Ωignore_endΩ*/;

  let dialog: HTMLDialogElement;
  let panel: HTMLDivElement;
  const id = Math.random().toString(36).slice(2);
  let pushed = false;
  let closing = false;
  let opener: HTMLElement | null = null;

  const animated = () => settings.effects !== "off";
  const phone = () => window.matchMedia("(max-width: 719px)").matches;

  function show() {
    if (!dialog || dialog.open) return;
    opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    if (backCloses) {
      history.pushState({ beelotSheet: id }, "", location.href);
      pushed = true;
    }
    if (animated()) {
      const full = settings.effects === "full";
      const from = variant === "sheet" && phone() ? { transform: full ? "translateY(100%)" : "translateY(0)", opacity: full ? 1 : 0 } : { transform: full ? "scale(0.94) translateY(12px)" : "scale(1)", opacity: 0 };
      panel.animate([from, { transform: "none", opacity: 1 }], { duration: full ? 460 : 180, easing: full ? "cubic-bezier(0.2, 0.9, 0.25, 1.05)" : "ease-out" });
      dialog.animate([{ backgroundColor: "rgb(4 3 10 / 0)" }, { backgroundColor: "rgb(4 3 10 / 0.6)" }], { duration: 260, easing: "ease-out" });
    }
  }

  async function hide(reason: Reason) {
    if (!dialog?.open || closing) return;
    closing = true;
    if (animated()) {
      const full = settings.effects === "full";
      const to = variant === "sheet" && phone() && full ? { transform: "translateY(100%)" } : { transform: full ? "scale(0.96)" : "none", opacity: 0 };
      const animation = panel.animate([{ transform: getComputedStyle(panel).transform === "none" ? "none" : getComputedStyle(panel).transform }, to], { duration: full ? 240 : 140, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
      dialog.animate([{ backgroundColor: "rgb(4 3 10 / 0.6)" }, { backgroundColor: "rgb(4 3 10 / 0)" }], { duration: 240, fill: "forwards" });
      await animation.finished.catch(() => {});
      animation.cancel();
    }
    closing = false;
    // The sheet's component may be gone by now (the page changed while it closed).
    if (!dialog) return;
    dialog.close();
    dialog.getAnimations().forEach((animation) => animation.cancel());
    if (pushed) {
      pushed = false;
      if (reason !== "back" && history.state?.beelotSheet === id) history.back();
    }
    open = false;
    if (reason !== "navigated") opener?.focus?.({ preventScroll: true });
    onclose?.(reason);
  }

   function close(reason: Reason = "closed") {
    return hide(reason);
  }

  $effect(() => {
    if (open) show();
    else if (dialog?.open) hide("closed");
  });

  $effect(() => {
    const stopPop = onPopState((state) => {
      if (!dialog?.open || !pushed) return false;
      if (state?.beelotSheet === id) return false;
      pushed = false;
      hide("back");
      return true;
    });
    const stopNavigate = onBeforeNavigate(() => {
      if (dialog?.open) {
        pushed = false;
        hide("navigated");
      }
    });
    return () => {
      stopPop();
      stopNavigate();
    };
  });

  function cancel(event: Event) {
    event.preventDefault();
    if (dismissible) hide("closed");
  }

  function backdrop(event: MouseEvent) {
    if (event.target === dialog && dismissible) hide("closed");
  }

  // Drag the grabber down to dismiss: past 110 px or a quick flick closes, otherwise it springs back.
  let dragStart = 0;
  let dragAt = 0;
  let dragTime = 0;
  function dragDown(event: PointerEvent) {
    if (!dismissible) return;
    dragStart = event.clientY;
    dragAt = 0;
    dragTime = performance.now();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function dragMove(event: PointerEvent) {
    if (!dragStart) return;
    dragAt = Math.max(0, event.clientY - dragStart);
    panel.style.setProperty("translate", `0 ${dragAt}px`);
  }
  function dragEnd() {
    if (!dragStart) return;
    const speed = dragAt / Math.max(1, performance.now() - dragTime);
    dragStart = 0;
    panel.style.removeProperty("translate");
    if (dragAt > 110 || speed > 0.8) hide("closed");
    else if (animated() && dragAt > 0) panel.animate([{ translate: `0 ${dragAt}px` }, { translate: "0 0" }], { duration: 380, easing: "cubic-bezier(0.2, 0.9, 0.25, 1.2)" });
  }
;
async () => {

  { const $$_dialog0 = svelteHTML.createElement("dialog", {              "class":`sheet ${variant} ${extra}`,"aria-label":label,"aria-labelledby":labelledby,"aria-describedby":describedby,"oncancel":cancel,"onclick":backdrop,});dialog = $$_dialog0;wide;
   { const $$_div1 = svelteHTML.createElement("div", {  "class":`panel`,});panel = $$_div1;
    if(variant === "sheet" && dismissible){
       { svelteHTML.createElement("div", {           "class":`grabber`,"onpointerdown":dragDown,"onpointermove":dragMove,"onpointerup":dragEnd,"onpointercancel":dragEnd,"aria-hidden":`true`,}); { svelteHTML.createElement("span", {}); } }
    }
    if(closeButton && dismissible && variant !== "cover"){
       { svelteHTML.createElement("button", {       "class":`close`,"type":`button`,"aria-label":t("Close"),"onclick":() => hide("closed"),}); { const $$_X3C = __sveltets_2_ensureComponent(X); new $$_X3C({ target: __sveltets_2_any(), props: {    "size":20,"strokeWidth":2.4,}});} }
    }
    if(open){
      ;__sveltets_2_ensureSnippet(children());
    }
   }
 }


};
return { props: {} as any as Props, exports: {} as any as { close: typeof close }, bindings: __sveltets_$$bindings('open'), slots: {}, events: {} }}
const Sheet__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Sheet__SvelteComponent_ = ReturnType<typeof Sheet__SvelteComponent_>;
/*Ωignore_endΩ*/export default Sheet__SvelteComponent_;