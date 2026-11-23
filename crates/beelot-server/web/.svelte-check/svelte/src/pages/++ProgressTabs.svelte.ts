///<reference types="svelte" />
;
import { t } from "$lib/i18n/i18n.svelte";

;type $$ComponentProps =  { current: "stats" | "leaderboard" };function $$render() {

  
  let { current }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
;
async () => {

 { svelteHTML.createElement("nav", {   "class":`sub`,"aria-label":t("Progress"),});
   { svelteHTML.createElement("a", {   "href":`/stats`,"aria-current":current === "stats" ? "page" : undefined,});t("My statistics"); }
   { svelteHTML.createElement("a", {   "href":`/leaderboard`,"aria-current":current === "leaderboard" ? "page" : undefined,});t("Leaderboard"); }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const ProgressTabs__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type ProgressTabs__SvelteComponent_ = ReturnType<typeof ProgressTabs__SvelteComponent_>;
/*Ωignore_endΩ*/export default ProgressTabs__SvelteComponent_;