///<reference types="svelte" />
;// The page: the banners, the navigation, the page of the address, the sheets that routes open, and the live regions.

import { onMount } from "svelte";
import { api, setPrivateSession } from "$lib/api/client";
import { createMusicPlayer, musicGain, musicTrack, musicWanted } from "$lib/audio/music";
import { t } from "$lib/i18n/i18n.svelte";
import { account, defaultPlayerName, loadAccount } from "$lib/stores/account.svelte";
import { dismissInvite, type Invite } from "$lib/stores/friends.svelte";
import { live } from "$lib/stores/live.svelte";
import { navigate, route, router, startRouter } from "$lib/stores/router.svelte";
import { applySettings, settings } from "$lib/stores/settings.svelte";
import { tableController } from "./table/session.svelte";
import Banners from "./shell/Banners.svelte";
import Nav from "./shell/Nav.svelte";
import Home from "./pages/Home.svelte";
import Crew from "./pages/Crew.svelte";
import Public from "./pages/Public.svelte";
import Tutorial from "./pages/Tutorial.svelte";
import Stats from "./pages/Stats.svelte";
import Leaderboard from "./pages/Leaderboard.svelte";
import Settings from "./pages/Settings.svelte";
import Privacy from "./pages/Privacy.svelte";
import SetupSheet from "./pages/SetupSheet.svelte";
import HelpSheet from "./pages/HelpSheet.svelte";
import TableView from "./table/TableView.svelte";
function $$render() {

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  applySettings();

  const current = $derived(route());
  let crewMessage = $state("");

  const titles: Record<string, string> = {
    private: "Bring the crew.",
    public: "Find a game.",
    tutorial: "Tutorial",
    stats: "My statistics",
    leaderboard: "Leaderboard",
    settings: "Settings",
    privacy: "Privacy policy"
  };

  $effect(() => {
    const view = current.view;
    document.title = view === "home" ? t("Beelot — Play Belote") : view === "table" ? `${t("Play")} — Beelot` : `${t(titles[view] ?? "")} — Beelot`;
  });

  // The music plays at a table only, when the player turned it on and the page is visible (US-164).
  let player: ReturnType<typeof createMusicPlayer> | null = null;
  let visible = $state(typeof document === "undefined" || document.visibilityState !== "hidden");
  $effect(() => {
    const want = musicWanted({ enabled: settings.music, view: current.view, visible });
    if (!player) {
      if (!settings.music) return;
      const audio = new Audio();
      audio.preload = "none";
      player = createMusicPlayer(audio, (callback, ms) => window.setTimeout(callback, ms));
    }
    player.update({ want, src: musicTrack(settings.theme), gain: musicGain(settings.musicVolume) });
  });

  async function joinInvite(invite: Invite) {
    dismissInvite(invite);
    try {
      const access = await api.join(invite.code, defaultPlayerName());
      setPrivateSession(access);
      navigate(`/online/private/table/${access.tableId}`);
    } catch (error) {
      crewMessage = (error as Error).message;
      navigate("/online/private");
    }
  }

  onMount(() => {
    startRouter();
    loadAccount();
    const onVisibility = () => (visible = document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    const gesture = () => player?.gesture();
    document.addEventListener("pointerdown", gesture, { passive: true });
    document.addEventListener("keydown", gesture, { passive: true });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => document.removeEventListener("visibilitychange", onVisibility);
  });
;
async () => {

 { svelteHTML.createElement("a", {     "class":`skip`,"href":`#main`,"onclick":(event) => { event.preventDefault(); document.getElementById("main")?.focus(); },});t("Skip to the content"); }
 { const $$_srennaB0C = __sveltets_2_ensureComponent(Banners); new $$_srennaB0C({ target: __sveltets_2_any(), props: {    "onReconnect":() => tableController.reconnectNow(),"onJoinInvite":joinInvite,}});}

 { svelteHTML.createElement("div", {  "class":`shell`,});current.view === "table";
  if(current.tab){
     { const $$_vaN1C = __sveltets_2_ensureComponent(Nav); new $$_vaN1C({ target: __sveltets_2_any(), props: {  "current":current.tab,}});}
  }
   { svelteHTML.createElement("main", {   "id":`main`,"tabindex":-1,});
    if(current.view === "home"){
       { const $$_emoH2C = __sveltets_2_ensureComponent(Home); new $$_emoH2C({ target: __sveltets_2_any(), props: {}});}
    } else if (current.view === "private"){
       { const $$_werC2C = __sveltets_2_ensureComponent(Crew); const $$_werC2 = new $$_werC2C({ target: __sveltets_2_any(), props: {     message:crewMessage,"friendCode":router.path.startsWith("/friends/add/") ? current.params.id : undefined,}});/*Ωignore_startΩ*/() => crewMessage = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_werC2.$$bindings = 'message';}
    } else if (current.view === "public"){
       { const $$_cilbuP2C = __sveltets_2_ensureComponent(Public); new $$_cilbuP2C({ target: __sveltets_2_any(), props: {}});}
    } else if (current.view === "tutorial"){
       { const $$_lairotuT2C = __sveltets_2_ensureComponent(Tutorial); new $$_lairotuT2C({ target: __sveltets_2_any(), props: {}});}
    } else if (current.view === "stats"){
       { const $$_statS2C = __sveltets_2_ensureComponent(Stats); new $$_statS2C({ target: __sveltets_2_any(), props: {}});}
    } else if (current.view === "leaderboard"){
       { const $$_draobredaeL2C = __sveltets_2_ensureComponent(Leaderboard); new $$_draobredaeL2C({ target: __sveltets_2_any(), props: {}});}
    } else if (current.view === "settings"){
       { const $$_sgnitteS2C = __sveltets_2_ensureComponent(Settings); new $$_sgnitteS2C({ target: __sveltets_2_any(), props: {}});}
    } else if (current.view === "privacy"){
       { const $$_ycavirP2C = __sveltets_2_ensureComponent(Privacy); new $$_ycavirP2C({ target: __sveltets_2_any(), props: {}});}
    } else if (current.view === "table" && current.params.id){
      current.params.id; {
         { const $$_weiVelbaT2C = __sveltets_2_ensureComponent(TableView); new $$_weiVelbaT2C({ target: __sveltets_2_any(), props: {    "id":current.params.id,"phase":current.phase,}});}
      }
    }
   }
 }

 { const $$_teehSputeS0C = __sveltets_2_ensureComponent(SetupSheet); new $$_teehSputeS0C({ target: __sveltets_2_any(), props: {}});}
 { const $$_teehSpleH0C = __sveltets_2_ensureComponent(HelpSheet); new $$_teehSpleH0C({ target: __sveltets_2_any(), props: {}});}

 { svelteHTML.createElement("span", {     "class":`visually-hidden`,"role":`status`,"aria-live":`polite`,});live.score; }
 { svelteHTML.createElement("span", {     "class":`visually-hidden`,"role":`status`,"aria-live":`polite`,});live.game; }
if(account.notice){ { svelteHTML.createElement("span", {   "class":`visually-hidden`,"role":`status`,});account.notice; }}


};
return { props: {} as Record<string, never>, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const App__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type App__SvelteComponent_ = ReturnType<typeof App__SvelteComponent_>;
/*Ωignore_endΩ*/export default App__SvelteComponent_;