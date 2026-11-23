///<reference types="svelte" />
;// The online lobby (US-121): the invitation code to copy or share, the seats (sit in an empty one), the owner's friends to
// invite (US-070), the table's rules for the owner (timer, announcements, spectators, tout-atout, target), the summary,
// and ready, start, start with bots, or leave a public table while it looks for players.

import { Check, Copy, Share2, UserPlus, Bot, Wifi, WifiOff } from "@lucide/svelte";
import { fly } from "svelte/transition";
import { formatNumber, playerName, t } from "$lib/i18n/i18n.svelte";
import { friends, inviteFriend } from "$lib/stores/friends.svelte";
import { settings } from "$lib/stores/settings.svelte";
import Button from "$lib/ui/Button.svelte";
import Segmented from "$lib/ui/Segmented.svelte";
import Avatar from "$lib/avatars/Avatar.svelte";
import type { TableGame } from "./game.svelte";

;type $$ComponentProps =  { game: TableGame };function $$render() {

  
  
  
  
  
  
  
  
  
  
  
  

  let { game }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
  const lobby = $derived(game.lobby!);
  const model = $derived(lobby.model);
  let copied = $state(false);
  let invited = $state<string[]>([]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(model.code);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* the code stays visible to copy by hand */
    }
  }

  async function share() {
    try {
      await navigator.share({ text: t("Join my Beelot table: code {0}", model.code) });
    } catch {
      /* cancelled */
    }
  }

  async function invite(friendId: string) {
    try {
      await inviteFriend(lobby.table.id, friendId);
      invited = [...invited, friendId];
    } catch {
      /* the button stays */
    }
  }

  const onlineFriends = $derived(model.rules.shown && friends.data ? friends.data.friends.filter((friend) => friend.online) : []);
  const summary = $derived.by(() => {
    const parts = [`${t("Variant: {0}", t(lobby.table.variantLabel))}.`];
    parts.push(model.summary.timer ? t("Turn timer: {0} seconds. A warning appears with 10 seconds remaining; an expired turn is played by a bot.", model.summary.timer) : t("Turn timer is disabled."));
    parts.push(t(model.summary.announcements ? "Announcements are on." : "Announcements are off."));
    if (model.summary.allTrumps !== null) parts.push(t(model.summary.allTrumps ? "Tout-atout and sans-atout are played." : "Only the four suits are played."));
    if (model.summary.spectators) parts.push(t("Spectators are allowed."));
    parts.push(t("The match is played to {0} points.", formatNumber(model.summary.target)));
    return parts.join(" ");
  });
  const onOff = $derived([
    { value: "on", label: t("On") },
    { value: "off", label: t("Off") }
  ]);
;
async () => {

 { svelteHTML.createElement("section", {     "class":`lobby glass`,"aria-labelledby":`lobby-title`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('section'),({ y: settings.effects === "full" ? 200 : 0, duration: 380, opacity: 0 })));
   { svelteHTML.createElement("h2", { "id":`lobby-title`,});t(model.title); }

  if(model.showCode){
     { svelteHTML.createElement("div", { "class":`code-row`,});
       { svelteHTML.createElement("span", { "class":`label`,});t("Invitation code"); }
       { svelteHTML.createElement("strong", {   "class":`code`,"aria-label":model.code.split("").join(" "),});    for(let letter of __sveltets_2_ensureArray(model.code.split(""))){let index = 1;index; { svelteHTML.createElement("span", {});letter; }} }
       { svelteHTML.createElement("div", { "class":`code-actions`,});
         { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"size":`sm`,"variant":`secondary`,"onclick":copy,}});if(copied){ { const $$_kcehC4C = __sveltets_2_ensureComponent(Check); new $$_kcehC4C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Copied");}else{ { const $$_ypoC4C = __sveltets_2_ensureComponent(Copy); new $$_ypoC4C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Copy");} Button}
        if(typeof navigator !== "undefined" && "share" in navigator){
           { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"size":`sm`,"variant":`secondary`,"onclick":share,}}); { const $$_2erahS4C = __sveltets_2_ensureComponent(Share2); new $$_2erahS4C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Share"); Button}
        }
       }
     }
  }

   { svelteHTML.createElement("div", {   "class":`seats`,"aria-label":t("Seats"),});
       for(let seat of __sveltets_2_ensureArray(model.seats)){seat.position;
       { svelteHTML.createElement("div", {     "class":`seat`,...__sveltets_2_empty({"data-team":seat.position % 2}),});seat.empty;seat.you;
         { svelteHTML.createElement("small", { "class":`team`,});t(seat.team); }
        if(seat.empty){
           { svelteHTML.createElement("span", {   "class":`placeholder`,"aria-hidden":`true`,});  }
           { svelteHTML.createElement("strong", {});t("Empty seat"); }
          if(seat.canSit){
             { svelteHTML.createElement("button", {       "class":`sit`,"type":`button`,"aria-label":t("Sit in this {0} seat", t(seat.team)),"onclick":() => game.onlineAction({ type: "seat", position: seat.position }),});t("Sit here"); }
          }
        }else{
           { const $$_ratavA3C = __sveltets_2_ensureComponent(Avatar); new $$_ratavA3C({ target: __sveltets_2_any(), props: {        "name":seat.name,"team":seat.position % 2,"size":`2.4rem`,"expression":seat.ready ? "pleased" : "neutral",}});}
           { svelteHTML.createElement("strong", {});seat.you ? t("{0} (you)", playerName(seat.name)) : playerName(seat.name); }
           { svelteHTML.createElement("span", {  "class":`state`,});seat.ready || seat.type === "BOT";
            if(seat.type === "BOT"){ { const $$_toB4C = __sveltets_2_ensureComponent(Bot); new $$_toB4C({ target: __sveltets_2_any(), props: {    "size":12,"aria-hidden":`true`,}});}t("Ready");}else{
              if(seat.connection === "connected"){ { const $$_ifiW4C = __sveltets_2_ensureComponent(Wifi); new $$_ifiW4C({ target: __sveltets_2_any(), props: {    "size":12,"aria-hidden":`true`,}});}}else{ { const $$_ffOifiW4C = __sveltets_2_ensureComponent(WifiOff); new $$_ffOifiW4C({ target: __sveltets_2_any(), props: {    "size":12,"aria-hidden":`true`,}});}}
              t(seat.ready ? "Ready" : "Waiting");  t(seat.connection === "bot" ? "Bot takeover" : seat.connection === "disconnected" ? "Disconnected" : "Connected");
            }
           }
        }
       }
    }
   }

  if(model.publicWaiting){ { svelteHTML.createElement("p", {   "class":`wait`,"role":`status`,});lobby.countdown; }}

  if(onlineFriends.length){
     { svelteHTML.createElement("div", { "class":`friends`,});
       { svelteHTML.createElement("h3", {});t("Invite friends"); }
       { svelteHTML.createElement("ul", {});
           for(let friend of __sveltets_2_ensureArray(onlineFriends)){friend.id;
           { svelteHTML.createElement("li", {});
             { svelteHTML.createElement("span", {});friend.name; }
             { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"size":`sm`,"disabled":invited.includes(friend.id),"onclick":() => invite(friend.id),}}); { const $$_sulPresU5C = __sveltets_2_ensureComponent(UserPlus); new $$_sulPresU5C({ target: __sveltets_2_any(), props: {    "size":14,"aria-hidden":`true`,}});}t(invited.includes(friend.id) ? "Invited" : "Invite"); Button}
           }
        }
       }
     }
  }

  if(model.rules.shown){
     { svelteHTML.createElement("details", { "class":`rules`,});
       { svelteHTML.createElement("summary", {});t("Table rules"); }
       { svelteHTML.createElement("div", { "class":`rules-body`,});
         { const $$_detnemgeS3C = __sveltets_2_ensureComponent(Segmented); new $$_detnemgeS3C({ target: __sveltets_2_any(), props: {            "name":`lobby-timer`,"label":t("Turn timer"),"size":`sm`,"value":String(model.rules.timer),"onchange":(value) => game.onlineAction({ type: "settings", turnTimer: Number(value) }),"options":[{ value: "0", label: t("No timer") }, { value: "30", label: t("30 seconds") }, { value: "60", label: t("60 seconds") }],}});}
         { const $$_detnemgeS3C = __sveltets_2_ensureComponent(Segmented); new $$_detnemgeS3C({ target: __sveltets_2_any(), props: {            "name":`lobby-announcements`,"label":t("Announcements"),"size":`sm`,"value":model.rules.announcements ? "on" : "off","onchange":(value) => game.onlineAction({ type: "settings", announcements: value === "on" }),"options":onOff,}});}
         { const $$_detnemgeS3C = __sveltets_2_ensureComponent(Segmented); new $$_detnemgeS3C({ target: __sveltets_2_any(), props: {            "name":`lobby-spectators`,"label":t("Spectators"),"size":`sm`,"value":model.rules.spectators ? "on" : "off","onchange":(value) => game.onlineAction({ type: "spectators", allowed: value === "on" }),"options":[{ value: "off", label: t("Not allowed") }, { value: "on", label: t("Allowed") }],}});}
        if(model.rules.allTrumps !== null){
           { const $$_detnemgeS3C = __sveltets_2_ensureComponent(Segmented); new $$_detnemgeS3C({ target: __sveltets_2_any(), props: {            "name":`lobby-all-trumps`,"label":t("Tout-atout and sans-atout"),"size":`sm`,"value":model.rules.allTrumps ? "on" : "off","onchange":(value) => game.onlineAction({ type: "settings", allTrumps: value === "on" }),"options":onOff,}});}
        }
         { const $$_detnemgeS3C = __sveltets_2_ensureComponent(Segmented); new $$_detnemgeS3C({ target: __sveltets_2_any(), props: {            "name":`lobby-target`,"label":t("Match target"),"size":`sm`,"value":String(model.rules.target),"onchange":(value) => game.onlineAction({ type: "settings", target: Number(value) }),"options":[500, 1000, 1500, 2000].map((target) => ({ value: String(target), label: t("{0} points", formatNumber(target)) })),}});}
       }
     }
  }

   { svelteHTML.createElement("p", { "class":`summary`,});summary; }
   { svelteHTML.createElement("p", {   "class":`message`,"role":`alert`,});lobby.message; }

   { svelteHTML.createElement("div", { "class":`actions`,});
    if(model.ready.shown && !lobby.table.publicTable){
       { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"variant":model.ready.on ? "secondary" : "primary","onclick":() => game.onlineAction({ type: "ready", ready: !model.ready.on }),}});t(model.ready.on ? "Not ready" : "I am ready"); Button}
    }
    if(model.start.shown){
       { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"disabled":model.start.disabled,"onclick":() => game.onlineAction({ type: "start", fillWithBots: false }),}});t("Start game"); Button}
    }
    if(model.startWithBots.shown){
       { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"disabled":model.startWithBots.disabled,"onclick":() => game.onlineAction({ type: "start", fillWithBots: true }),}}); { const $$_toB3C = __sveltets_2_ensureComponent(Bot); new $$_toB3C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Start now with bots"); Button}
    }
    if(model.publicWaiting){
       { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"variant":`secondary`,"onclick":() => game.leavePublic(),}});t("Leave table"); Button}
    }
   }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const LobbyPanel__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type LobbyPanel__SvelteComponent_ = ReturnType<typeof LobbyPanel__SvelteComponent_>;
/*Ωignore_endΩ*/export default LobbyPanel__SvelteComponent_;