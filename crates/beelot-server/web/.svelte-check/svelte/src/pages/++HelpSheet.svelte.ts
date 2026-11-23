///<reference types="svelte" />
;// The help sheet (US-123): the hint when the table has one, the card order and the rules, a link to the tutorial.

import { Lightbulb, GraduationCap } from "@lucide/svelte";
import { t } from "$lib/i18n/i18n.svelte";
import { navigate, route } from "$lib/stores/router.svelte";
import { help } from "$lib/stores/sheets.svelte";
import Sheet from "$lib/ui/Sheet.svelte";
import Button from "$lib/ui/Button.svelte";
import Rules from "./Rules.svelte";
function $$render() {

  
  
  
  
  
  
  
  

  // /rules opens the sheet over home; closing it leaves the address.
  $effect(() => {
    if (route().sheet === "help" && !help.open) {
      help.routed = true;
      help.hint = null;
      help.onClose = null;
      help.open = true;
    }
  });

  function closed(reason: string) {
    const after = help.onClose;
    help.onClose = null;
    if (help.routed && reason === "closed") navigate("/", { replace: true });
    help.routed = false;
    after?.(reason);
  }
;
async () => {

 { const $$_teehS0C = __sveltets_2_ensureComponent(Sheet); const $$_teehS0 = new $$_teehS0C({ target: __sveltets_2_any(), props: {         children:() => { return __sveltets_2_any(0); },open:help.open,"labelledby":`help-title`,"backCloses":!help.routed,"onclose":closed,"wide":true,}});/*Ωignore_startΩ*/() => help.open = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_teehS0.$$bindings = 'open';
   { svelteHTML.createElement("header", { "class":`head`,});
     { svelteHTML.createElement("p", { "class":`eyebrow`,});t("Help"); }
     { svelteHTML.createElement("h2", { "id":`help-title`,});t("Rules reference"); }
   }
  if(help.hint){
    const hint = help.hint;
     { const $$_nottuB1C = __sveltets_2_ensureComponent(Button); new $$_nottuB1C({ target: __sveltets_2_any(), props: { children:() => { return __sveltets_2_any(0); },"block":true,"onclick":() => { help.open = false; hint(); },}}); { const $$_blubthgiL2C = __sveltets_2_ensureComponent(Lightbulb); new $$_blubthgiL2C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}t("Ask for a hint"); Button}
  }
   { svelteHTML.createElement("div", { "class":`body`,}); { const $$_seluR2C = __sveltets_2_ensureComponent(Rules); new $$_seluR2C({ target: __sveltets_2_any(), props: {}});} }
   { const $$_nottuB1C = __sveltets_2_ensureComponent(Button); new $$_nottuB1C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"block":true,"href":`/tutorial`,}}); { const $$_paCnoitaudarG2C = __sveltets_2_ensureComponent(GraduationCap); new $$_paCnoitaudarG2C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}t("Learn the basics"); Button}
 Sheet}


};
return { props: {} as Record<string, never>, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const HelpSheet__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type HelpSheet__SvelteComponent_ = ReturnType<typeof HelpSheet__SvelteComponent_>;
/*Ωignore_endΩ*/export default HelpSheet__SvelteComponent_;