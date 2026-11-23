///<reference types="svelte" />
;// Home (Play tab): the hero, "Play now" (it opens the setup sheet, US-154), the matches to resume (US-122, US-145), the
// daily deal (US-150), the goal line (US-113), the tutorial banner (US-104) and the game modes.

import { ArrowRight, BookOpen, CalendarDays, Globe, Repeat2, ScrollText, Sparkles, Users, X, Zap } from "@lucide/svelte";
import { local } from "$lib/storage";
import { fly, scale } from "svelte/transition";
import { onMount } from "svelte";
import { api, apiJson, ApiError } from "$lib/api/client";
import { t, formatNumber } from "$lib/i18n/i18n.svelte";
import { forgetOnlineResume, forgetResume, onlineResumeCard, readOnlineResumes, readResume, resumeCard, type OnlineResumeCard, type ResumeCard } from "$lib/models/home-status";
import { dailyCard, type DailyInfo } from "$lib/models/small";
import { markTutorialSeen } from "$lib/models/prefs";
import { versionView } from "$lib/models/version";
import { account, refreshTutorialBanner } from "$lib/stores/account.svelte";
import { goals, goalText } from "$lib/stores/goals.svelte";
import { navigate } from "$lib/stores/router.svelte";
import { settings } from "$lib/stores/settings.svelte";
import Button from "$lib/ui/Button.svelte";
import PlayingCard from "$lib/cards/PlayingCard.svelte";
import Bee from "$lib/brand/Bee.svelte";
import Logo from "$lib/brand/Logo.svelte";
function $$render() {

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  let resume = $state<ResumeCard | null>(null);
  let online = $state<OnlineResumeCard[]>([]);
  let daily = $state<ReturnType<typeof dailyCard> | null>(null);
  let message = $state("");
  let version = $state<{ text: string; href: string | null } | null>(null);
  let dailyBusy = $state(false);

  const heroCards = [
    { rank: "J", suit: "HEARTS" },
    { rank: "9", suit: "CLUBS" },
    { rank: "A", suit: "SPADES" },
    { rank: "10", suit: "DIAMONDS" },
    { rank: "K", suit: "HEARTS" }
  ] as const;

  async function loadResume() {
    const record = readResume(local);
    if (!record) return;
    try {
      const model = resumeCard(await api.table(record.tableId));
      if (!model) forgetResume(local);
      resume = model;
    } catch (error) {
      if ((error as ApiError).status) forgetResume(local);
    }
  }

  async function loadOnline() {
    const cards: OnlineResumeCard[] = [];
    for (const record of readOnlineResumes(local)) {
      try {
        const model = onlineResumeCard(await api.table(record.tableId));
        if (model) cards.push(model);
        else forgetOnlineResume(local, record.tableId);
      } catch (error) {
        if ((error as ApiError).status) forgetOnlineResume(local, record.tableId);
      }
    }
    online = cards;
  }

  async function loadDaily() {
    try {
      daily = dailyCard(await apiJson<DailyInfo>("/api/daily?day=today"));
    } catch {
      daily = null;
    }
  }

  async function startDaily() {
    if (!daily?.canStart || dailyBusy) return;
    message = "";
    dailyBusy = true;
    try {
      const access = await api.startDaily();
      navigate(`/play/bot/bidding/${access.tableId}`);
    } catch (error) {
      message = (error as Error).message;
      loadDaily();
    } finally {
      dailyBusy = false;
    }
  }

  function forget(tableId: string) {
    forgetOnlineResume(local, tableId);
    online = online.filter((card) => card.tableId !== tableId);
  }

  function dismissTutorial() {
    markTutorialSeen(local);
    refreshTutorialBanner();
  }

  onMount(() => {
    loadResume();
    loadOnline();
    loadDaily();
    apiJson("/api/version")
      .then((info) => {
        version = versionView(info);
        // The browser's share of the traces (US-158) is only loaded when the operator turned it on.
        if (info?.browserTraces === true) import("$lib/models/telemetry").then((module) => module.install(window));
      })
      .catch(() => {});
  });

  const modes = [
    { href: "/online/private", icon: Users, title: "Bring the crew", text: "Open a private table and invite your favourite rivals.", tone: "honey" },
    { href: "/online/public", icon: Globe, title: "Find a game", text: "Join an open table — bots fill in if nobody shows up.", tone: "violet" },
    { href: "/play/local", icon: Repeat2, title: "Pass and play", text: "Share one device and take turns with your hand.", tone: "mint" },
    { href: "/tutorial", icon: BookOpen, title: "Learn the basics", text: "Master trump and tricks without the pressure.", tone: "coral" }
  ];
  const full = $derived(settings.effects === "full");
;
async () => {

 { svelteHTML.createElement("div", { "class":`page home`,});
   { svelteHTML.createElement("header", { "class":`top`,});
     { svelteHTML.createElement("span", { "class":`mobile-logo`,}); { const $$_ogoL3C = __sveltets_2_ensureComponent(Logo); new $$_ogoL3C({ target: __sveltets_2_any(), props: {  "size":`md`,}});} }
   }

   { svelteHTML.createElement("section", {   "class":`hero`,"aria-labelledby":`home-title`,});
     { svelteHTML.createElement("div", { "class":`hero-copy`,});
       { svelteHTML.createElement("p", { "class":`eyebrow`,});t("Classic & Contrée"); }
       { svelteHTML.createElement("h1", {   "id":`home-title`,"class":`headline`,});
        t("Deal in."); { svelteHTML.createElement("br", {});} { svelteHTML.createElement("span", { "class":`text-gradient`,});t("Good times"); }
        t("await.");
       }
       { svelteHTML.createElement("p", { "class":`intro`,});t("Play Belote with friends or bots. Free, no account needed."); }
       { svelteHTML.createElement("div", { "class":`cta`,});
         { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"size":`lg`,"onclick":() => navigate("/play/bot"),}});t("Play now");  { const $$_thgiRworrA5C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA5C({ target: __sveltets_2_any(), props: {      "size":20,"strokeWidth":2.6,"aria-hidden":`true`,}});} Button}
       }
       { svelteHTML.createElement("ul", {   "class":`badges`,"aria-label":t("Game highlights"),});
         { svelteHTML.createElement("li", {}); { const $$_paZ5C = __sveltets_2_ensureComponent(Zap); new $$_paZ5C({ target: __sveltets_2_any(), props: {    "size":15,"aria-hidden":`true`,}});}t("Jump in instantly"); }
         { svelteHTML.createElement("li", {}); { const $$_selkrapS5C = __sveltets_2_ensureComponent(Sparkles); new $$_selkrapS5C({ target: __sveltets_2_any(), props: {    "size":15,"aria-hidden":`true`,}});}t("Sharp bots, two levels"); }
         { svelteHTML.createElement("li", {}); { const $$_sresU5C = __sveltets_2_ensureComponent(Users); new $$_sresU5C({ target: __sveltets_2_any(), props: {    "size":15,"aria-hidden":`true`,}});}t("Better with friends"); }
       }
     }
     { svelteHTML.createElement("div", {   "class":`hero-art`,"aria-hidden":`true`,});
       { svelteHTML.createElement("div", { "class":`halo`,}); }
       { svelteHTML.createElement("div", {  "class":`fan`,});full;
            for(let card of __sveltets_2_ensureArray(heroCards)){let index = 1;index;
           { svelteHTML.createElement("div", {    "class":`fan-card`,});__sveltets_2_ensureType(String, Number, index - 2);__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: 160, duration: full ? 900 : 0, delay: full ? 120 + index * 90 : 0, opacity: 0 })));
             { const $$_draCgniyalP5C = __sveltets_2_ensureComponent(PlayingCard); new $$_draCgniyalP5C({ target: __sveltets_2_any(), props: {   card,"label":false,}});}
           }
        }
       }
       { svelteHTML.createElement("div", {  "class":`flyer`,});full; { const $$_eeB4C = __sveltets_2_ensureComponent(Bee); new $$_eeB4C({ target: __sveltets_2_any(), props: {  "size":`3.4rem`,}});} }
     }
   }

   { svelteHTML.createElement("p", {   "class":`message`,"role":`alert`,});message; }

   { svelteHTML.createElement("div", { "class":`status-cards`,});
    if(resume){
       { svelteHTML.createElement("a", {     "class":`status-card resume`,"href":resume.path,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('a'),({ y: 16, duration: 320 })));
         { svelteHTML.createElement("span", { "class":`icon`,}); { const $$_selkrapS4C = __sveltets_2_ensureComponent(Sparkles); new $$_selkrapS4C({ target: __sveltets_2_any(), props: {    "size":20,"aria-hidden":`true`,}});} }
         { svelteHTML.createElement("span", { "class":`copy`,}); { svelteHTML.createElement("strong", {});t("Resume your match"); } { svelteHTML.createElement("small", {});t("{0} · your team {1}, theirs {2}", t(resume.variantLabel), formatNumber(resume.yours), formatNumber(resume.theirs)); } }
         { const $$_thgiRworrA3C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA3C({ target: __sveltets_2_any(), props: {    "size":20,"aria-hidden":`true`,}});}
       }
    }
       for(let card of __sveltets_2_ensureArray(online)){card.tableId;
       { svelteHTML.createElement("div", {   "class":`status-row`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('div'),({ y: 16, duration: 320 })));
         { svelteHTML.createElement("a", {   "class":`status-card resume`,"href":card.path,});
           { svelteHTML.createElement("span", { "class":`icon`,}); { const $$_ebolG5C = __sveltets_2_ensureComponent(Globe); new $$_ebolG5C({ target: __sveltets_2_any(), props: {    "size":20,"aria-hidden":`true`,}});} }
           { svelteHTML.createElement("span", { "class":`copy`,});
             { svelteHTML.createElement("strong", {});t("Resume your match"); }
             { svelteHTML.createElement("small", {});card.waiting ? t("{0} · waiting for players", t(card.variantLabel)) : t("{0} · your team {1}, theirs {2}", t(card.variantLabel), formatNumber(card.yours), formatNumber(card.theirs)); }
           }
           { const $$_thgiRworrA4C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA4C({ target: __sveltets_2_any(), props: {    "size":20,"aria-hidden":`true`,}});}
         }
         { svelteHTML.createElement("button", {       "class":`forget`,"type":`button`,"aria-label":t("Forget this match"),"onclick":() => forget(card.tableId),}); { const $$_X4C = __sveltets_2_ensureComponent(X); new $$_X4C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});} }
       }
    }
    if(daily){
       { svelteHTML.createElement("a", {          "class":`status-card daily`,"href":`/`,"aria-disabled":!daily.canStart || undefined,"onclick":(event) => { event.preventDefault(); startDaily(); },});!daily.canStart;__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('a'),({ y: 16, duration: 320 })));
         { svelteHTML.createElement("span", { "class":`icon`,}); { const $$_syaDradnelaC4C = __sveltets_2_ensureComponent(CalendarDays); new $$_syaDradnelaC4C({ target: __sveltets_2_any(), props: {    "size":20,"aria-hidden":`true`,}});} }
         { svelteHTML.createElement("span", { "class":`copy`,}); { svelteHTML.createElement("strong", {});t("Daily deal"); } { svelteHTML.createElement("small", {});t("{0} · {1}", t(daily.variantKey), t(daily.detail, ...daily.values.map((value) => formatNumber(value)))); } }
        if(daily.canStart){ { const $$_thgiRworrA3C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA3C({ target: __sveltets_2_any(), props: {    "size":20,"aria-hidden":`true`,}});}}
       }
    }
    if(goals.ledger){
       { svelteHTML.createElement("a", {     "class":`goal`,"href":`/stats`,});__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('a'),({ start: 0.9, duration: 300 }))); { svelteHTML.createElement("span", {   "class":`flame`,"aria-hidden":`true`,});  }goalText(); }
    }
   }

  if(account.tutorialBanner){
     { svelteHTML.createElement("aside", {     "class":`tutorial glass`,"aria-labelledby":`tutorial-title`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('aside'),({ y: 16, duration: 300 })));
       { const $$_eeB2C = __sveltets_2_ensureComponent(Bee); new $$_eeB2C({ target: __sveltets_2_any(), props: {    "size":`2.6rem`,"flutter":false,}});}
       { svelteHTML.createElement("div", {});
         { svelteHTML.createElement("p", {   "id":`tutorial-title`,"class":`tutorial-title`,});t("New to Belote? Learn it in 3 minutes"); }
         { svelteHTML.createElement("div", { "class":`tutorial-actions`,});
           { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"size":`sm`,"href":`/tutorial`,}});t("Start the tutorial");  { const $$_thgiRworrA5C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA5C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});} Button}
           { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"size":`sm`,"variant":`ghost`,"onclick":dismissTutorial,}});t("Dismiss"); Button}
         }
       }
     }
  }

   { svelteHTML.createElement("section", {   "class":`modes`,"aria-label":t("Game modes"),});
        for(let mode of __sveltets_2_ensureArray(modes)){let index = 1;mode.href;
      const Icon = mode.icon;
       { svelteHTML.createElement("a", {     "class":`mode ${mode.tone}`,"href":mode.href,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('a'),({ y: 24, duration: full ? 500 : 0, delay: full ? 200 + index * 70 : 0 })));
         { svelteHTML.createElement("span", { "class":`mode-icon`,}); { const $$_nocI4C = __sveltets_2_ensureComponent(Icon); new $$_nocI4C({ target: __sveltets_2_any(), props: {      "size":24,"strokeWidth":2.2,"aria-hidden":`true`,}});} }
         { svelteHTML.createElement("strong", {});t(mode.title); }
         { svelteHTML.createElement("small", {});t(mode.text); }
         { svelteHTML.createElement("span", { "class":`arrow`,}); { const $$_thgiRworrA4C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA4C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});} }
       }
    }
     { svelteHTML.createElement("a", {   "class":`mode device`,"href":`/rules`,});
       { svelteHTML.createElement("span", { "class":`mode-icon`,}); { const $$_txeTllorcS4C = __sveltets_2_ensureComponent(ScrollText); new $$_txeTllorcS4C({ target: __sveltets_2_any(), props: {      "size":24,"strokeWidth":2.2,"aria-hidden":`true`,}});} }
       { svelteHTML.createElement("strong", {});t("Rules reference"); }
       { svelteHTML.createElement("small", {});t("Everything you need to settle a rules debate."); }
       { svelteHTML.createElement("span", { "class":`arrow`,}); { const $$_thgiRworrA4C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA4C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});} }
     }
   }

   { svelteHTML.createElement("p", { "class":`rule-note`,});t("Shuffle up, team up, and race to 1,000 points."); }
   { svelteHTML.createElement("footer", { "class":`footer`,});
     { svelteHTML.createElement("a", {   "class":`link`,"href":`/privacy`,});t("Privacy policy"); }
    if(version){
      if(version.href){ { svelteHTML.createElement("a", {         "class":`link`,"href":version.href,"target":`_blank`,"rel":`noopener noreferrer`,"title":t("Release notes"),});version.text; }}else{ { svelteHTML.createElement("span", {});version.text; }}
    }
   }
 }


};
return { props: {} as Record<string, never>, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Home__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Home__SvelteComponent_ = ReturnType<typeof Home__SvelteComponent_>;
/*Ωignore_endΩ*/export default Home__SvelteComponent_;