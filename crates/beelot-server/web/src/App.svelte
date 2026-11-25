<script lang="ts">
  // The page: the banners, the navigation, the page of the address, the sheets that routes open, and the live regions.
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
  import AccountButton from "./shell/AccountButton.svelte";
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
</script>

<a class="skip" href="#main" onclick={(event) => { event.preventDefault(); document.getElementById("main")?.focus(); }}>{t("Skip to the content")}</a>
<Banners onReconnect={() => tableController.reconnectNow()} onJoinInvite={joinInvite} />
<AccountButton />

<div class="shell" class:at-table={current.view === "table"}>
  {#if current.tab}
    <Nav current={current.tab} />
  {/if}
  <main id="main" tabindex="-1">
    {#if current.view === "home"}
      <Home />
    {:else if current.view === "private"}
      <Crew bind:message={crewMessage} friendCode={router.path.startsWith("/friends/add/") ? current.params.id : undefined} />
    {:else if current.view === "public"}
      <Public />
    {:else if current.view === "tutorial"}
      <Tutorial />
    {:else if current.view === "stats"}
      <Stats />
    {:else if current.view === "leaderboard"}
      <Leaderboard />
    {:else if current.view === "settings"}
      <Settings />
    {:else if current.view === "privacy"}
      <Privacy />
    {:else if current.view === "table" && current.params.id}
      {#key current.params.id}
        <TableView id={current.params.id} phase={current.phase} />
      {/key}
    {/if}
  </main>
</div>

<SetupSheet />
<HelpSheet />

<span class="visually-hidden" role="status" aria-live="polite">{live.score}</span>
<span class="visually-hidden" role="status" aria-live="polite">{live.game}</span>
{#if account.notice}<span class="visually-hidden" role="status">{account.notice}</span>{/if}

<style>
  .skip {
    position: fixed;
    z-index: 100;
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.6rem 1rem;
    border-radius: 99px;
    background: var(--color-honey-400);
    color: #1b1203;
    font-weight: 700;
    translate: 0 -200%;
    transition: translate 0.2s;
  }
  .skip:focus {
    translate: 0 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .skip {
      transition: none;
    }
  }
  main {
    min-height: 100dvh;
    outline: none;
  }
  @media (min-width: 1024px) {
    .shell:not(.at-table) main {
      padding-left: 15rem;
    }
  }
</style>
