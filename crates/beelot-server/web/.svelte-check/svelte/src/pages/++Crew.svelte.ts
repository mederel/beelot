///<reference types="svelte" />
;// Crew (US-070, US-124): create a private table, join or watch one with its code, the friends of a signed-in player, the
// online tables this tab still holds a seat at, and the friend link that opens /friends/add/{code}.

import { ArrowRight, Check, Copy, Eye, Globe, Link2, Plus, UserMinus, UserPlus, X } from "@lucide/svelte";
import { onMount } from "svelte";
import { fly } from "svelte/transition";
import { api, apiJson, setPrivateSession, tableRequest, tableTokens, type ApiError } from "$lib/api/client";
import { t } from "$lib/i18n/i18n.svelte";
import { friendLinkUrl, linkMessage, openTables, sortFriends, type OpenTable } from "$lib/models/small";
import { account, defaultPlayerName } from "$lib/stores/account.svelte";
import { friendAction, friends, loadFriends } from "$lib/stores/friends.svelte";
import { navigate, route } from "$lib/stores/router.svelte";
import { notices } from "$lib/stores/notices.svelte";
import Button from "$lib/ui/Button.svelte";
import CodeBoxes from "$lib/ui/CodeBoxes.svelte";

;type $$ComponentProps =  { message?: string; friendCode?: string };function $$render() {

  
  
  
  
  
  
  
  
  
  
  
  
  
  

  let { message = $bindable(""), friendCode }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props()/*Ωignore_startΩ*/;message;/*Ωignore_endΩ*/;
  let name = $state(defaultPlayerName());
  let code = $state("");
  let busy = $state(false);
  let open = $state<OpenTable[]>([]);
  let copied = $state(false);

  $effect(() => {
    if (account.name && (name === "" || name === t("Player"))) name = account.name;
  });

  function enter(access: { tableId: string; playerToken: string }) {
    setPrivateSession(access);
    navigate(`/online/private/table/${access.tableId}`);
  }

  async function join(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    message = "";
    try {
      enter(await api.join(code, name));
    } catch (error) {
      message = (error as Error).message;
    } finally {
      busy = false;
    }
  }

  async function watch() {
    message = "";
    try {
      enter(await api.watch(code));
    } catch (error) {
      message = (error as Error).message;
    }
  }

  async function addFriend(link: string) {
    let text: string;
    try {
      const { text: key, values } = linkMessage(await apiJson("/api/friends/link", tableRequest("POST", { code: link })));
      text = t(key, ...values);
    } catch (error) {
      text = (error as ApiError).status === 401 ? t("Sign in to add friends, then open the link again.") : (error as Error).message;
    }
    navigate("/online/private", { replace: true });
    message = text;
    loadFriends();
  }

  async function copyLink() {
    if (!friends.data) return;
    try {
      await navigator.clipboard.writeText(friendLinkUrl(location.origin, friends.data.code));
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* the link stays visible to copy by hand */
    }
  }

  onMount(async () => {
    message = notices.take("/online/private") || message;
    if (friendCode) addFriend(friendCode);
    const snapshots = await Promise.all(Object.keys(tableTokens()).map((id) => api.table(id).catch(() => null)));
    if (route().view === "private") open = openTables(snapshots);
  });
;
async () => {

 { svelteHTML.createElement("div", { "class":`page crew`,});
   { svelteHTML.createElement("header", { "class":`head`,});
     { svelteHTML.createElement("p", { "class":`eyebrow`,});t("Friends, rivals, legends"); }
     { svelteHTML.createElement("h1", { "class":`page-title`,});t("Bring the crew."); }
     { svelteHTML.createElement("p", { "class":`lead`,});t("Make a room in seconds or use a six-character invite to jump into the fun."); }
   }

   { svelteHTML.createElement("div", { "class":`grid`,});
     { svelteHTML.createElement("section", { "class":`card create glass`,});
       { svelteHTML.createElement("span", { "class":`badge`,}); { const $$_sulP4C = __sveltets_2_ensureComponent(Plus); new $$_sulP4C({ target: __sveltets_2_any(), props: {    "size":22,"aria-hidden":`true`,}});} }
       { svelteHTML.createElement("h2", {});t("Create a table"); }
       { svelteHTML.createElement("p", {});t("You get a code to share. Friends join in one tap; bots can fill the empty seats."); }
       { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {    children:() => { return __sveltets_2_any(0); },"href":`/online/private/new`,"size":`lg`,"block":true,}});t("Create a private table");  { const $$_thgiRworrA4C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA4C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});} Button}
     }

     { svelteHTML.createElement("form", {   "class":`card glass`,"onsubmit":join,});
       { svelteHTML.createElement("h2", {});t("Join friends"); }
       { svelteHTML.createElement("label", {});
         { svelteHTML.createElement("span", { "class":`label`,});t("Your name"); }
         { svelteHTML.createElement("input", {          "class":`field`,"autocomplete":`name`,"maxlength":30,"name":`playerName`,"required":true,"bind:value":name,});/*Ωignore_startΩ*/() => name = __sveltets_2_any(null);/*Ωignore_endΩ*/}
       }
       { svelteHTML.createElement("span", {   "class":`label`,"id":`invitation-code-label`,});t("Invitation code"); }
       { const $$_sexoBedoC3C = __sveltets_2_ensureComponent(CodeBoxes); const $$_sexoBedoC3 = new $$_sexoBedoC3C({ target: __sveltets_2_any(), props: {     value:code,"labelledby":`invitation-code-label`,}});/*Ωignore_startΩ*/() => code = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_sexoBedoC3.$$bindings = 'value';}
       { svelteHTML.createElement("div", { "class":`actions`,});
         { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {  children:() => { return __sveltets_2_any(0); },"type":`submit`,busy,}});t("Join table"); Button}
         { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"onclick":watch,}}); { const $$_eyE5C = __sveltets_2_ensureComponent(Eye); new $$_eyE5C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}t("Watch this table"); Button}
       }
     }
   }

   { svelteHTML.createElement("p", {   "class":`message`,"role":`alert`,});message; }

  if(open.length){
     { svelteHTML.createElement("section", {     "class":`card glass`,"aria-labelledby":`crew-open-title`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('section'),({ y: 12, duration: 300 })));
       { svelteHTML.createElement("h2", { "id":`crew-open-title`,});t("Your open tables"); }
       { svelteHTML.createElement("ul", { "class":`list`,});
           for(let table of __sveltets_2_ensureArray(open)){table.id;
           { svelteHTML.createElement("li", {}); { svelteHTML.createElement("a", {   "class":`row-link`,"href":table.path,}); { svelteHTML.createElement("span", {});t("{0} · {1}", t(table.variantLabel), t(table.waiting ? "Waiting" : "Resume")); } { const $$_thgiRworrA5C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA5C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});} } }
        }
       }
     }
  }

  if(friends.data){
    const data = friends.data;
     { svelteHTML.createElement("section", { "class":`card glass friends`,});
       { svelteHTML.createElement("h2", {});t("Friends"); }
       { svelteHTML.createElement("div", { "class":`link-row`,});
         { svelteHTML.createElement("label", { "class":`grow`,});
           { svelteHTML.createElement("span", { "class":`label`,}); { const $$_2kniL5C = __sveltets_2_ensureComponent(Link2); new $$_2kniL5C({ target: __sveltets_2_any(), props: {    "size":14,"aria-hidden":`true`,}});} t("Your friend link"); }
           { svelteHTML.createElement("input", {      "class":`field`,"readonly":true,"value":friendLinkUrl(location.origin, data.code),"onfocus":(event) => (event.currentTarget as HTMLInputElement).select(),});}
         }
         { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"onclick":copyLink,}});if(copied){ { const $$_kcehC4C = __sveltets_2_ensureComponent(Check); new $$_kcehC4C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}t("Copied");}else{ { const $$_ypoC4C = __sveltets_2_ensureComponent(Copy); new $$_ypoC4C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}t("Copy");} Button}
       }
      if(data.requests.length){
         { svelteHTML.createElement("h3", {});t("Friend requests"); }
         { svelteHTML.createElement("ul", { "class":`list`,});
             for(let person of __sveltets_2_ensureArray(data.requests)){person.id;
             { svelteHTML.createElement("li", { "class":`friend`,});
               { svelteHTML.createElement("span", { "class":`who`,}); { const $$_sulPresU5C = __sveltets_2_ensureComponent(UserPlus); new $$_sulPresU5C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});}person.name; }
               { svelteHTML.createElement("span", { "class":`buttons`,});
                 { const $$_nottuB5C = __sveltets_2_ensureComponent(Button); new $$_nottuB5C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"size":`sm`,"onclick":() => friendAction("POST", `/api/friends/${person.id}/accept`),}});t("Accept"); Button}
                 { const $$_nottuB5C = __sveltets_2_ensureComponent(Button); new $$_nottuB5C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"size":`sm`,"variant":`secondary`,"onclick":() => friendAction("DELETE", `/api/friends/${person.id}`),}}); { const $$_X6C = __sveltets_2_ensureComponent(X); new $$_X6C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Decline"); Button}
               }
             }
          }
         }
      }
      if(data.friends.length){
         { svelteHTML.createElement("ul", { "class":`list`,});
             for(let friend of __sveltets_2_ensureArray(sortFriends(data.friends))){friend.id;
             { svelteHTML.createElement("li", { "class":`friend`,});
               { svelteHTML.createElement("span", { "class":`who`,}); { svelteHTML.createElement("span", {    "class":`dot`,"aria-hidden":`true`,});friend.online; }friend.name; { svelteHTML.createElement("small", {});friend.online === undefined ? "" : t(friend.online ? "Online" : "Offline"); } }
               { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"size":`sm`,"variant":`ghost`,"onclick":() => friendAction("DELETE", `/api/friends/${friend.id}`),}}); { const $$_suniMresU5C = __sveltets_2_ensureComponent(UserMinus); new $$_suniMresU5C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Remove"); Button}
             }
          }
         }
      }else{
         { svelteHTML.createElement("p", { "class":`muted`,});t("No friends yet. Share your link: when someone opens it and you accept, you are friends."); }
      }
     }
  }

   { svelteHTML.createElement("a", {   "class":`public-link glass`,"href":`/online/public`,});
     { svelteHTML.createElement("span", { "class":`badge violet`,}); { const $$_ebolG3C = __sveltets_2_ensureComponent(Globe); new $$_ebolG3C({ target: __sveltets_2_any(), props: {    "size":22,"aria-hidden":`true`,}});} }
     { svelteHTML.createElement("span", {}); { svelteHTML.createElement("strong", {});t("Find a game"); } { svelteHTML.createElement("small", {});t("Join an open table — bots fill in if nobody shows up."); } }
     { const $$_thgiRworrA2C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA2C({ target: __sveltets_2_any(), props: {    "size":20,"aria-hidden":`true`,}});}
   }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('message'), slots: {}, events: {} }}
const Crew__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Crew__SvelteComponent_ = ReturnType<typeof Crew__SvelteComponent_>;
/*Ωignore_endΩ*/export default Crew__SvelteComponent_;