///<reference types="svelte" />
;// Signing in with a passkey, or creating an account with one (US-084), after the warning that there is no recovery.

import { Fingerprint, KeyRound, ShieldAlert } from "@lucide/svelte";
import { slide } from "svelte/transition";
import { t } from "$lib/i18n/i18n.svelte";
import { ceremonyFailure, loadAccount, passkeysSupported, signInWithPasskey, signUpWithPasskey } from "$lib/stores/account.svelte";
import Button from "$lib/ui/Button.svelte";

;type $$ComponentProps =  { warning?: boolean; ondone?: () => void };function $$render() {

  
  
  
  
  
  

  let { warning = $bindable(false), ondone }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props()/*Ωignore_startΩ*/;warning;/*Ωignore_endΩ*/;
  let status = $state("");
  let busy = $state(false);

  async function run(ceremony: () => Promise<void>) {
    status = "";
    busy = true;
    try {
      await ceremony();
    } catch (error) {
      status = t(ceremonyFailure(error));
      return;
    } finally {
      busy = false;
    }
    await loadAccount();
    ondone?.();
  }
;
async () => {

 { svelteHTML.createElement("div", { "class":`panel`,});
  if(passkeysSupported){
     { svelteHTML.createElement("div", { "class":`buttons`,});
       { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"onclick":() => run(signInWithPasskey),"disabled":busy,}}); { const $$_tnirpregniF3C = __sveltets_2_ensureComponent(Fingerprint); new $$_tnirpregniF3C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}t("Sign in with a passkey"); Button}
       { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {         children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"onclick":() => (warning = !warning),"disabled":busy,"aria-expanded":warning,"aria-controls":`passkey-warning`,}}); { const $$_dnuoRyeK3C = __sveltets_2_ensureComponent(KeyRound); new $$_dnuoRyeK3C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}t("Create an account"); Button}
     }
    if(warning){
       { svelteHTML.createElement("div", {     "class":`warning`,"id":`passkey-warning`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 220 })));
         { const $$_trelAdleihS2C = __sveltets_2_ensureComponent(ShieldAlert); new $$_trelAdleihS2C({ target: __sveltets_2_any(), props: {    "size":20,"aria-hidden":`true`,}});}
         { svelteHTML.createElement("div", {});
           { svelteHTML.createElement("p", {});t("Your passkey is the only way to sign in. If you lose it, you lose your account: there is no recovery."); }
           { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"size":`sm`,"onclick":() => run(signUpWithPasskey),"disabled":busy,}});t("I understand, create my passkey"); Button}
         }
       }
    }
  }else{
     { svelteHTML.createElement("p", { "class":`status`,});t("Your browser does not support passkeys. You can still play as a guest."); }
  }
   { svelteHTML.createElement("p", {   "class":`status`,"role":`status`,});status; }
   { svelteHTML.createElement("p", { "class":`privacy`,}); { svelteHTML.createElement("a", {   "class":`link`,"href":`/privacy`,});t("How we handle your data"); } }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('warning'), slots: {}, events: {} }}
const SignInPanel__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type SignInPanel__SvelteComponent_ = ReturnType<typeof SignInPanel__SvelteComponent_>;
/*Ωignore_endΩ*/export default SignInPanel__SvelteComponent_;