///<reference types="svelte" />
;// The four tabs (US-117): a floating glass dock at the bottom of a phone, a rail on the left from 1024 px. A highlight
// slides to the tab of the page; there is none at a table.

import { CircleUserRound, Spade, Trophy, Users } from "@lucide/svelte";
import { t } from "$lib/i18n/i18n.svelte";
import { tabs, type Tab } from "$lib/models/routes";
import Logo from "$lib/brand/Logo.svelte";

;type $$ComponentProps =  { current: Tab | null };function $$render() {

  
  
  
  
  
  

  let { current }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
  const icons = { play: Spade, crew: Users, progress: Trophy, me: CircleUserRound };
  const index = $derived(Math.max(0, tabs.findIndex((tab) => tab.id === current)));
;
async () => {

 { svelteHTML.createElement("nav", {    "class":`nav`,"aria-label":t("Main"),});__sveltets_2_ensureType(String, Number, index);
   { svelteHTML.createElement("a", {     "class":`brand`,"href":`/`,"aria-label":t("Beelot home"),}); { const $$_ogoL2C = __sveltets_2_ensureComponent(Logo); new $$_ogoL2C({ target: __sveltets_2_any(), props: {  "size":`md`,}});} }
   { svelteHTML.createElement("div", { "class":`tabs`,});
     { svelteHTML.createElement("span", {   "class":`highlight`,"aria-hidden":`true`,}); }
       for(let tab of __sveltets_2_ensureArray(tabs)){tab.id;
      const Icon = icons[tab.id];
       { svelteHTML.createElement("a", {     "class":`tab`,"href":tab.href,"aria-current":tab.id === current ? "page" : undefined,});
         { const $$_nocI3C = __sveltets_2_ensureComponent(Icon); new $$_nocI3C({ target: __sveltets_2_any(), props: {      "size":22,"strokeWidth":tab.id === current ? 2.6 : 2,"aria-hidden":`true`,}});}
         { svelteHTML.createElement("span", {});t(tab.label); }
       }
    }
   }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Nav__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Nav__SvelteComponent_ = ReturnType<typeof Nav__SvelteComponent_>;
/*Ωignore_endΩ*/export default Nav__SvelteComponent_;