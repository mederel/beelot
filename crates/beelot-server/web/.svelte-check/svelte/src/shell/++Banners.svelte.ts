///<reference types="svelte" />
;// The notes at the top of the page: offline (US-073), a slow or lost connection with "Reconnect now" (US-141, US-163),
// the moves missed during a gap, and a friend's invitation with a one-tap join (US-070).

import { WifiOff, RefreshCw, Mail } from "@lucide/svelte";
import { fly } from "svelte/transition";
import { t } from "$lib/i18n/i18n.svelte";
import { connection } from "$lib/stores/connection.svelte";
import { friends, dismissInvite } from "$lib/stores/friends.svelte";

;type $$ComponentProps =  { onReconnect: () => void; onJoinInvite: (invite: { id: string; from: string; code: string }) => void };function $$render() {

  
  
  
  
  
  
  

  let { onReconnect, onJoinInvite }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
;
async () => {

 { svelteHTML.createElement("div", { "class":`banners`,});
  if(friends.invite){
    const invite = friends.invite;
     { svelteHTML.createElement("div", {     "class":`banner invite glass`,"role":`status`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: -24, duration: 300 })));
       { const $$_liaM2C = __sveltets_2_ensureComponent(Mail); new $$_liaM2C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}
       { svelteHTML.createElement("span", {});t("{0} invites you to a table.", invite.from); }
       { svelteHTML.createElement("span", { "class":`actions`,});
         { svelteHTML.createElement("button", {     "class":`pill strong`,"type":`button`,"onclick":() => onJoinInvite(invite),});t("Join"); }
         { svelteHTML.createElement("button", {     "class":`pill`,"type":`button`,"onclick":() => dismissInvite(invite),});t("Dismiss"); }
       }
     }
  }
  if(connection.offline){
     { svelteHTML.createElement("p", {     "class":`banner warn`,"role":`status`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('p'),({ y: -24, duration: 300 }))); { const $$_ffOifiW2C = __sveltets_2_ensureComponent(WifiOff); new $$_ffOifiW2C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});} t("You are offline. Games need a connection; the rules and the tutorial still work."); }
  } else if (connection.trouble){
     { svelteHTML.createElement("p", {     "class":`banner warn`,"role":`status`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('p'),({ y: -24, duration: 300 })));
       { const $$_wChserfeR2C = __sveltets_2_ensureComponent(RefreshCw); new $$_wChserfeR2C({ target: __sveltets_2_any(), props: {      "size":18,"class":`spin`,"aria-hidden":`true`,}});}
       { svelteHTML.createElement("span", {});t("The connection is slow or lost. Retrying…"); }
      if(connection.reconnect.visible){
         { svelteHTML.createElement("button", {       "class":`pill strong`,"type":`button`,"disabled":connection.reconnect.disabled,"onclick":onReconnect,});t("Reconnect now"); }
      }
     }
  }
   { svelteHTML.createElement("p", {       "class":`banner info`,"role":`status`,"aria-live":`polite`,"hidden":!connection.missed,});
    connection.missed ? t(connection.missed.key).replace("{n}", String(connection.missed.n)) : "";
   }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Banners__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Banners__SvelteComponent_ = ReturnType<typeof Banners__SvelteComponent_>;
/*Ωignore_endΩ*/export default Banners__SvelteComponent_;