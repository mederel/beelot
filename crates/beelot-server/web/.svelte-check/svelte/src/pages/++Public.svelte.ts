///<reference types="svelte" />
;// Find a game (US-021): pick a variant and the server seats the player at an open table; bots take the empty seats after
// a minute. A seat still held from an earlier visit is given up first.

import { ArrowRight, Radar } from "@lucide/svelte";
import { api, forgetTableSession, getPrivateSession, setPrivateSession } from "$lib/api/client";
import { t } from "$lib/i18n/i18n.svelte";
import { account, defaultPlayerName } from "$lib/stores/account.svelte";
import { navigate } from "$lib/stores/router.svelte";
import { notices } from "$lib/stores/notices.svelte";
import Button from "$lib/ui/Button.svelte";
import Segmented from "$lib/ui/Segmented.svelte";
function $$render() {

  
  
  
  
  
  
  
  
  
  

  let name = $state(defaultPlayerName());
  let variant = $state<"CLASSIC" | "CONTREE">("CLASSIC");
  let busy = $state(false);
  let message = $state(notices.take("/online/public"));

  $effect(() => {
    if (account.name && (name === "" || name === t("Player"))) name = account.name;
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    message = "";
    try {
      const previous = getPrivateSession();
      if (previous) {
        await api.act(previous.tableId, { type: "leave" }).catch(() => {});
        forgetTableSession(previous.tableId);
        setPrivateSession(null);
      }
      const access = await api.quickMatch(variant, name);
      setPrivateSession(access);
      navigate(`/online/public/table/${access.tableId}`);
    } catch (error) {
      message = (error as Error).message;
    } finally {
      busy = false;
    }
  }
;
async () => {

 { svelteHTML.createElement("div", { "class":`page public`,});
   { svelteHTML.createElement("header", { "class":`head`,});
     { svelteHTML.createElement("p", { "class":`eyebrow`,});t("Strangers welcome"); }
     { svelteHTML.createElement("h1", { "class":`page-title`,});t("Find a game."); }
     { svelteHTML.createElement("p", { "class":`lead`,});t("Pick a variant and we'll seat you at an open table. If it isn't full within a minute, bots take the empty seats."); }
   }

   { svelteHTML.createElement("form", {   "class":`card glass`,"onsubmit":submit,});
     { svelteHTML.createElement("div", {   "class":`radar`,"aria-hidden":`true`,}); { svelteHTML.createElement("span", {}); } { svelteHTML.createElement("span", {}); } { svelteHTML.createElement("span", {}); } { const $$_radaR3C = __sveltets_2_ensureComponent(Radar); new $$_radaR3C({ target: __sveltets_2_any(), props: {  "size":34,}});} }
     { svelteHTML.createElement("h2", {});t("Quick match"); }
     { svelteHTML.createElement("label", {});
       { svelteHTML.createElement("span", { "class":`label`,});t("Your name"); }
       { svelteHTML.createElement("input", {          "class":`field`,"autocomplete":`name`,"maxlength":30,"name":`playerName`,"required":true,"bind:value":name,});/*Ωignore_startΩ*/() => name = __sveltets_2_any(null);/*Ωignore_endΩ*/}
     }
     { const $$_detnemgeS2C = __sveltets_2_ensureComponent(Segmented); const $$_detnemgeS2 = new $$_detnemgeS2C({ target: __sveltets_2_any(), props: {        "name":`public-variant`,"label":t("Game variant"),value:variant,"options":[{ value: "CLASSIC", label: t("Classic Belote") }, { value: "CONTREE", label: t("Contrée") }],}});/*Ωignore_startΩ*/() => variant = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_detnemgeS2.$$bindings = 'value';}
     { svelteHTML.createElement("p", {   "class":`message`,"role":`alert`,});message; }
     { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"type":`submit`,"size":`lg`,"block":true,busy,}});t("Find a game");  { const $$_thgiRworrA3C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA3C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});} Button}
   }
 }


};
return { props: {} as Record<string, never>, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Public__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Public__SvelteComponent_ = ReturnType<typeof Public__SvelteComponent_>;
/*Ωignore_endΩ*/export default Public__SvelteComponent_;