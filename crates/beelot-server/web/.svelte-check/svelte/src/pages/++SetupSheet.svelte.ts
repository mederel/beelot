///<reference types="svelte" />
;// The setup sheet (US-118): one sheet for solo, pass-and-play and crew tables, opened by its routes over its tab's page.
// It is filled with that mode's remembered choices (US-102) and the start button creates the game. Closing it puts the
// address back on the page under it; nothing is sent until the player starts.

import { ArrowRight, CircleHelp } from "@lucide/svelte";
import { local } from "$lib/storage";
import { slide } from "svelte/transition";
import { api, setPrivateSession } from "$lib/api/client";
import { t } from "$lib/i18n/i18n.svelte";
import type { SetupMode } from "$lib/models/routes";
import { createRequest, defaultTarget, loadSetup, saveSetup, setupBlocks, setupHome, setupPath, submitLabel, TARGETS, type Setup } from "$lib/models/setup-form";
import { account, defaultPlayerName } from "$lib/stores/account.svelte";
import { navigate, route } from "$lib/stores/router.svelte";
import { openHelp } from "$lib/stores/sheets.svelte";
import { formatNumber } from "$lib/i18n/i18n.svelte";
import Avatar from "$lib/avatars/Avatar.svelte";
import Button from "$lib/ui/Button.svelte";
import Segmented from "$lib/ui/Segmented.svelte";
import Sheet from "$lib/ui/Sheet.svelte";
function $$render() {

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  let open = $state(false);
  let mode = $state<SetupMode>("solo");
  let setup = $state<Setup>(loadSetup(local, "solo"));
  let seats = $state(["", "", "", ""]);
  let owner = $state("");
  let message = $state("");
  let busy = $state(false);

  const blocks = $derived(setupBlocks(mode, setup.variant));

  // A route with the setup sheet opens it with that mode's remembered choices; already open, only the mode changes.
  $effect(() => {
    const current = route();
    if (current.sheet !== "setup") return;
    const wanted = current.params.mode ?? "solo";
    if (open) {
      mode = wanted;
      return;
    }
    mode = wanted;
    setup = loadSetup(local, wanted);
    owner = defaultPlayerName();
    message = "";
    open = true;
  });

  // The account's name fills an untouched name field once it is known (US-072).
  $effect(() => {
    if (account.name && (owner === "" || owner === t("Player"))) owner = account.name;
  });

  function changeMode(next: SetupMode) {
    history.replaceState({}, "", setupPath(next));
    mode = next;
    message = "";
  }

  function changeVariant(next: Setup["variant"]) {
    // A target still at the previous variant's default follows the new variant's default (US-130).
    if (setup.target === defaultTarget(setup.variant)) setup.target = defaultTarget(next);
    setup.variant = next;
  }

  function closed(reason: string) {
    if (reason === "closed" || reason === "back") navigate(setupHome(mode), { replace: true });
  }

  function whatIsThis() {
    open = false;
    openHelp({ onClose: () => (open = true) });
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = "";
    busy = true;
    const values = { ...setup, seats: [...seats], playerName: owner };
    try {
      const { variant, difficulty, announcements, allTrumps, target } = setup;
      saveSetup(local, mode, mode === "crew" ? { variant } : { variant, difficulty, announcements, allTrumps, target });
      const access = await api.createTable(createRequest(mode, values));
      if (mode === "crew") {
        setPrivateSession(access);
        navigate(`/online/private/table/${access.tableId}`);
      } else {
        navigate(`/play/bot/bidding/${access.tableId}`);
      }
    } catch (error) {
      message = (error as Error).message;
    } finally {
      busy = false;
    }
  }

  const seatLabels = ["North", "East", "South", "West"];
  const onOff = $derived([
    { value: "on", label: t("On") },
    { value: "off", label: t("Off") }
  ]);
;
async () => {

 { const $$_teehS0C = __sveltets_2_ensureComponent(Sheet); const $$_teehS0 = new $$_teehS0C({ target: __sveltets_2_any(), props: {    children:() => { return __sveltets_2_any(0); },open,"labelledby":`setup-title`,"onclose":closed,}});/*Ωignore_startΩ*/() => open = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_teehS0.$$bindings = 'open';
   { svelteHTML.createElement("form", {   "class":`setup`,"onsubmit":submit,});
     { svelteHTML.createElement("header", {});
       { svelteHTML.createElement("p", { "class":`eyebrow`,});t("New game"); }
       { svelteHTML.createElement("h2", { "id":`setup-title`,});t("Set up your table"); }
     }

     { const $$_detnemgeS2C = __sveltets_2_ensureComponent(Segmented); const $$_detnemgeS2 = new $$_detnemgeS2C({ target: __sveltets_2_any(), props: {           "name":`setup-mode`,"label":t("Mode"),value:mode,"onchange":changeMode,"options":[
        { value: "solo", label: t("Solo") },
        { value: "pass", label: t("Pass and play") },
        { value: "crew", label: t("Crew") }
      ],}});/*Ωignore_startΩ*/() => mode = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_detnemgeS2.$$bindings = 'value';}

     { svelteHTML.createElement("div", {     "class":`variants`,"role":`radiogroup`,"aria-label":t("Game variant"),});
         for(let variant of __sveltets_2_ensureArray(([{ value: "CLASSIC", title: "Classic Belote", text: "Simple bid on the turned-up card" }, { value: "CONTREE", title: "Contrée", text: "Auction from 80 to 160, with coinche" }]))){variant.value;
         { svelteHTML.createElement("label", {  "class":`variant`,});setup.variant === variant.value;
           { svelteHTML.createElement("input", {          "type":`radio`,"name":`setup-variant`,"value":variant.value,"checked":setup.variant === variant.value,"onchange":() => changeVariant(variant.value as Setup["variant"]),});}
           { svelteHTML.createElement("strong", {});t(variant.title); }
           { svelteHTML.createElement("small", {});t(variant.text); }
         }
      }
     }
     { svelteHTML.createElement("button", {     "class":`what`,"type":`button`,"onclick":whatIsThis,}); { const $$_pleHelcriC3C = __sveltets_2_ensureComponent(CircleHelp); new $$_pleHelcriC3C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Open the rules and card order"); }

    if(blocks.seats){
       { svelteHTML.createElement("fieldset", {   "class":`seats`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('fieldset'),({ duration: 220 })));
         { svelteHTML.createElement("legend", { "class":`label`,});t("Players"); }
         { svelteHTML.createElement("div", { "class":`seat-grid`,});
              for(let seat of __sveltets_2_ensureArray(seatLabels)){let index = 1;seat;
             { svelteHTML.createElement("label", { "class":`seat`,});
               { svelteHTML.createElement("span", {});t(seat); }
               { svelteHTML.createElement("input", {            "class":`field`,"autocomplete":`off`,"maxlength":30,"placeholder":t("Bot"),"bind:value":seats[index],"name":seat.toLowerCase(),});/*Ωignore_startΩ*/() => seats[index] = __sveltets_2_any(null);/*Ωignore_endΩ*/}
             }
          }
         }
       }
    }

    if(blocks.owner){
       { svelteHTML.createElement("label", {   "class":`owner`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('label'),({ duration: 220 })));
         { svelteHTML.createElement("span", { "class":`label`,});t("Your name"); }
         { svelteHTML.createElement("input", {          "class":`field`,"autocomplete":`name`,"maxlength":30,"required":true,"bind:value":owner,"name":`playerName`,});/*Ωignore_startΩ*/() => owner = __sveltets_2_any(null);/*Ωignore_endΩ*/}
       }
    }

    if(blocks.bots){
       { svelteHTML.createElement("div", {       "class":`bots`,"role":`radiogroup`,"aria-label":t("Bots"),});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('div'),({ duration: 220 })));
         { svelteHTML.createElement("span", { "class":`label`,});t("Bots"); }
         { svelteHTML.createElement("div", { "class":`bot-choices`,});
             for(let level of __sveltets_2_ensureArray(([{ value: "RELAXED", title: "Relaxed", text: "Play by the rules of thumb", faces: ["Camille", "Hugo"] }, { value: "CHALLENGING", title: "Challenging", text: "Think ahead before every card", faces: ["Manon", "Luc"] }]))){level.value;
             { svelteHTML.createElement("label", {  "class":`bot`,});setup.difficulty === level.value;
               { svelteHTML.createElement("input", {          "type":`radio`,"name":`setup-difficulty`,"value":level.value,"checked":setup.difficulty === level.value,"onchange":() => (setup.difficulty = level.value as Setup["difficulty"]),});}
               { svelteHTML.createElement("span", { "class":`faces`,});   for(let face of __sveltets_2_ensureArray(level.faces)){face; { const $$_ratavA6C = __sveltets_2_ensureComponent(Avatar); new $$_ratavA6C({ target: __sveltets_2_any(), props: {      "name":face,"size":`2rem`,"expression":setup.difficulty === level.value ? "pleased" : "neutral",}});}} }
               { svelteHTML.createElement("strong", {});t(level.title); }
               { svelteHTML.createElement("small", {});t(level.text); }
             }
          }
         }
       }
    }

    if(blocks.rules){
       { svelteHTML.createElement("details", {   "class":`more`,});__sveltets_2_ensureTransition(slide(svelteHTML.mapElementTag('details'),({ duration: 220 })));
         { svelteHTML.createElement("summary", {});t("More rules"); }
         { svelteHTML.createElement("div", { "class":`more-body`,});
           { const $$_detnemgeS4C = __sveltets_2_ensureComponent(Segmented); const $$_detnemgeS4 = new $$_detnemgeS4C({ target: __sveltets_2_any(), props: {          "name":`setup-target`,"label":t("Match target"),"size":`sm`,value:setup.target,"options":TARGETS.map((value) => ({ value, label: formatNumber(value) })),}});/*Ωignore_startΩ*/() => setup.target = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_detnemgeS4.$$bindings = 'value';}
           { svelteHTML.createElement("div", {});
             { const $$_detnemgeS5C = __sveltets_2_ensureComponent(Segmented); new $$_detnemgeS5C({ target: __sveltets_2_any(), props: {            "name":`setup-announcements`,"label":t("Announcements"),"size":`sm`,"value":setup.announcements ? "on" : "off","onchange":(value) => (setup.announcements = value === "on"),"options":onOff,}});}
             { svelteHTML.createElement("p", { "class":`note`,});t("Announcements are bonus combinations in your hand, such as tierce, cinquante, cent and carré, that score extra points when declared."); }
           }
          if(blocks.allTrumps){
             { const $$_detnemgeS4C = __sveltets_2_ensureComponent(Segmented); new $$_detnemgeS4C({ target: __sveltets_2_any(), props: {            "name":`setup-all-trumps`,"label":t("Tout-atout and sans-atout"),"size":`sm`,"value":setup.allTrumps ? "on" : "off","onchange":(value) => (setup.allTrumps = value === "on"),"options":onOff,}});}
          }
         }
       }
    }

     { svelteHTML.createElement("p", {   "class":`message`,"role":`alert`,});message; }
     { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"type":`submit`,"size":`lg`,"block":true,busy,}});t(submitLabel(mode));  { const $$_thgiRworrA3C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA3C({ target: __sveltets_2_any(), props: {      "size":20,"strokeWidth":2.6,"aria-hidden":`true`,}});} Button}
   }
 Sheet}


};
return { props: {} as Record<string, never>, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const SetupSheet__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type SetupSheet__SvelteComponent_ = ReturnType<typeof SetupSheet__SvelteComponent_>;
/*Ωignore_endΩ*/export default SetupSheet__SvelteComponent_;