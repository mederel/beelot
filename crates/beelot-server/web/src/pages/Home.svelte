<script lang="ts">
  // Home (Play tab): the hero, "Play now" (it opens the setup sheet, US-154), the matches to resume (US-122, US-145), the
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
</script>

<div class="page home">
  <header class="top">
    <span class="mobile-logo"><Logo size="md" /></span>
  </header>

  <section class="hero" aria-labelledby="home-title">
    <div class="hero-copy">
      <p class="eyebrow">{t("Classic & Contrée")}</p>
      <h1 id="home-title" class="headline">
        {t("Deal in.")}<br /><span class="text-gradient">{t("Good times")}</span>
        {t("await.")}
      </h1>
      <p class="intro">{t("Play Belote with friends or bots. Free, no account needed.")}</p>
      <div class="cta">
        <Button size="lg" onclick={() => navigate("/play/bot")}>{t("Play now")} <ArrowRight size={20} strokeWidth={2.6} aria-hidden="true" /></Button>
      </div>
      <ul class="badges" aria-label={t("Game highlights")}>
        <li><Zap size={15} aria-hidden="true" />{t("Jump in instantly")}</li>
        <li><Sparkles size={15} aria-hidden="true" />{t("Sharp bots, two levels")}</li>
        <li><Users size={15} aria-hidden="true" />{t("Better with friends")}</li>
      </ul>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="halo"></div>
      <div class="fan" class:float={full}>
        {#each heroCards as card, index (index)}
          <div class="fan-card" style:--i={index - 2} in:fly={{ y: 160, duration: full ? 900 : 0, delay: full ? 120 + index * 90 : 0, opacity: 0 }}>
            <PlayingCard {card} label={false} />
          </div>
        {/each}
      </div>
      <div class="flyer" class:flying={full}><Bee size="3.4rem" /></div>
    </div>
  </section>

  <p class="message" role="alert">{message}</p>

  <div class="status-cards">
    {#if resume}
      <a class="status-card resume" href={resume.path} in:fly={{ y: 16, duration: 320 }}>
        <span class="icon"><Sparkles size={20} aria-hidden="true" /></span>
        <span class="copy"><strong>{t("Resume your match")}</strong><small>{t("{0} · your team {1}, theirs {2}", t(resume.variantLabel), formatNumber(resume.yours), formatNumber(resume.theirs))}</small></span>
        <ArrowRight size={20} aria-hidden="true" />
      </a>
    {/if}
    {#each online as card (card.tableId)}
      <div class="status-row" in:fly={{ y: 16, duration: 320 }}>
        <a class="status-card resume" href={card.path}>
          <span class="icon"><Globe size={20} aria-hidden="true" /></span>
          <span class="copy">
            <strong>{t("Resume your match")}</strong>
            <small>{card.waiting ? t("{0} · waiting for players", t(card.variantLabel)) : t("{0} · your team {1}, theirs {2}", t(card.variantLabel), formatNumber(card.yours), formatNumber(card.theirs))}</small>
          </span>
          <ArrowRight size={20} aria-hidden="true" />
        </a>
        <button class="forget" type="button" aria-label={t("Forget this match")} onclick={() => forget(card.tableId)}><X size={18} aria-hidden="true" /></button>
      </div>
    {/each}
    {#if daily}
      <a class="status-card daily" class:done={!daily.canStart} href="/" aria-disabled={!daily.canStart || undefined} onclick={(event) => { event.preventDefault(); startDaily(); }} in:fly={{ y: 16, duration: 320 }}>
        <span class="icon"><CalendarDays size={20} aria-hidden="true" /></span>
        <span class="copy"><strong>{t("Daily deal")}</strong><small>{t("{0} · {1}", t(daily.variantKey), t(daily.detail, ...daily.values.map((value) => formatNumber(value))))}</small></span>
        {#if daily.canStart}<ArrowRight size={20} aria-hidden="true" />{/if}
      </a>
    {/if}
    {#if goals.ledger}
      <a class="goal" href="/stats" in:scale={{ start: 0.9, duration: 300 }}><span class="flame" aria-hidden="true">🔥</span>{goalText()}</a>
    {/if}
  </div>

  {#if account.tutorialBanner}
    <aside class="tutorial glass" aria-labelledby="tutorial-title" transition:fly={{ y: 16, duration: 300 }}>
      <Bee size="2.6rem" flutter={false} />
      <div>
        <p id="tutorial-title" class="tutorial-title">{t("New to Belote? Learn it in 3 minutes")}</p>
        <div class="tutorial-actions">
          <Button size="sm" href="/tutorial">{t("Start the tutorial")} <ArrowRight size={16} aria-hidden="true" /></Button>
          <Button size="sm" variant="ghost" onclick={dismissTutorial}>{t("Dismiss")}</Button>
        </div>
      </div>
    </aside>
  {/if}

  <section class="modes" aria-label={t("Game modes")}>
    {#each modes as mode, index (mode.href)}
      {@const Icon = mode.icon}
      <a class="mode {mode.tone}" href={mode.href} in:fly={{ y: 24, duration: full ? 500 : 0, delay: full ? 200 + index * 70 : 0 }}>
        <span class="mode-icon"><Icon size={24} strokeWidth={2.2} aria-hidden="true" /></span>
        <strong>{t(mode.title)}</strong>
        <small>{t(mode.text)}</small>
        <span class="arrow"><ArrowRight size={18} aria-hidden="true" /></span>
      </a>
    {/each}
    <a class="mode device" href="/rules">
      <span class="mode-icon"><ScrollText size={24} strokeWidth={2.2} aria-hidden="true" /></span>
      <strong>{t("Rules reference")}</strong>
      <small>{t("Everything you need to settle a rules debate.")}</small>
      <span class="arrow"><ArrowRight size={18} aria-hidden="true" /></span>
    </a>
  </section>

  <p class="rule-note">{t("Shuffle up, team up, and race to 1,000 points.")}</p>
  <footer class="footer">
    <a class="link" href="/privacy">{t("Privacy policy")}</a>
    {#if version}
      {#if version.href}<a class="link" href={version.href} target="_blank" rel="noopener noreferrer" title={t("Release notes")}>{version.text}</a>{:else}<span>{version.text}</span>{/if}
    {/if}
  </footer>
</div>

<style>
  .home {
    display: grid;
    gap: 1.25rem;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  @media (min-width: 1024px) {
    .mobile-logo {
      display: none;
    }
  }
  .hero {
    display: grid;
    gap: 1rem;
    align-items: center;
  }
  @media (min-width: 900px) {
    .hero {
      grid-template-columns: 1.1fr 1fr;
      gap: 2rem;
      min-height: 26rem;
    }
  }
  .hero-copy {
    display: grid;
    gap: 1rem;
    order: 2;
  }
  @media (min-width: 900px) {
    .hero-copy {
      order: 1;
    }
  }
  .headline {
    font-size: clamp(2.6rem, 11vw, 4.6rem);
    font-weight: 800;
    line-height: 0.95;
    letter-spacing: -0.045em;
  }
  .intro {
    max-width: 30rem;
    color: var(--color-muted);
    font-size: 1.05rem;
  }
  .cta :global(.btn) {
    width: 100%;
  }
  @media (min-width: 560px) {
    .cta :global(.btn) {
      width: auto;
      min-width: 16rem;
    }
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    list-style: none;
    padding: 0;
  }
  .badges li {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    border-radius: 99px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--color-muted);
    background: rgb(255 255 255 / 0.05);
    border: 1px solid rgb(255 255 255 / 0.08);
  }
  .badges :global(svg) {
    color: var(--color-honey-400);
  }
  .hero-art {
    position: relative;
    order: 1;
    height: 13.5rem;
    display: grid;
    place-items: center;
  }
  @media (min-width: 900px) {
    .hero-art {
      order: 2;
      height: 24rem;
    }
  }
  .halo {
    position: absolute;
    width: 18rem;
    height: 18rem;
    border-radius: 50%;
    background: radial-gradient(circle, rgb(255 194 46 / 0.35), rgb(139 108 255 / 0.15) 45%, transparent 70%);
    filter: blur(10px);
  }
  .fan {
    position: relative;
    width: 1px;
    height: 1px;
    --cw: clamp(4.4rem, 20vw, 6.8rem);
  }
  .fan.float {
    animation: float 6s ease-in-out infinite;
  }
  .fan-card {
    position: absolute;
    left: 0;
    top: 0;
    translate: -50% -42%;
    transform-origin: 50% 160%;
    rotate: calc(var(--i) * 13deg);
    filter: drop-shadow(0 18px 24px rgb(0 0 0 / 0.45));
  }
  .flyer {
    position: absolute;
    top: 6%;
    right: 12%;
  }
  .flyer.flying {
    animation: fly-loop 9s ease-in-out infinite;
  }
  @keyframes fly-loop {
    0%, 100% { translate: 0 0; rotate: -6deg; }
    25% { translate: -2.5rem 1rem; rotate: 8deg; }
    50% { translate: -5rem -0.5rem; rotate: -4deg; }
    75% { translate: -2rem -1.5rem; rotate: 10deg; }
  }
  .status-cards {
    display: grid;
    gap: 0.6rem;
  }
  .status-cards:empty {
    display: none;
  }
  @media (min-width: 900px) {
    .status-cards {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .status-row {
    position: relative;
  }
  .status-card {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.9rem 1rem;
    border-radius: 1.25rem;
    text-decoration: none;
    color: var(--color-ink);
    background: linear-gradient(120deg, rgb(255 194 46 / 0.16), rgb(255 255 255 / 0.04));
    border: 1px solid rgb(255 194 46 / 0.28);
    transition: transform 0.45s var(--ease-spring), background 0.2s;
  }
  .status-row .status-card {
    padding-right: 3.5rem;
  }
  .status-card:hover {
    background: linear-gradient(120deg, rgb(255 194 46 / 0.24), rgb(255 255 255 / 0.06));
  }
  .status-card:active {
    transform: scale(0.98);
  }
  .status-card.daily {
    background: linear-gradient(120deg, rgb(139 108 255 / 0.22), rgb(255 255 255 / 0.04));
    border-color: rgb(164 139 255 / 0.32);
  }
  .status-card.done {
    opacity: 0.7;
    cursor: default;
  }
  .icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 0.9rem;
    color: #1b1203;
    background: linear-gradient(140deg, var(--color-honey-300), var(--color-honey-600));
  }
  .daily .icon {
    color: #fff;
    background: linear-gradient(140deg, var(--color-violet-400), var(--color-violet-600));
  }
  .copy {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .copy small {
    color: var(--color-muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .forget {
    position: absolute;
    top: 50%;
    right: 0.6rem;
    translate: 0 -50%;
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    color: var(--color-muted);
    background: rgb(255 255 255 / 0.06);
  }
  .goal {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    gap: 0.5rem;
    justify-self: start;
    padding: 0.55rem 1rem;
    border-radius: 99px;
    font-weight: 650;
    font-size: 0.92rem;
    color: var(--color-honey-200);
    background: rgb(255 159 28 / 0.12);
    border: 1px solid rgb(255 159 28 / 0.3);
    text-decoration: none;
  }
  .tutorial {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 1rem 1.1rem;
    border-radius: 1.4rem;
  }
  .tutorial-title {
    font-weight: 700;
    font-size: 1.02rem;
  }
  .tutorial-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.7rem;
  }
  @media (min-width: 900px) {
    .modes {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .mode {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-height: 9.5rem;
    padding: 1rem;
    border-radius: 1.4rem;
    text-decoration: none;
    color: var(--color-ink);
    background: linear-gradient(160deg, rgb(255 255 255 / 0.08), rgb(255 255 255 / 0.02));
    border: 1px solid rgb(255 255 255 / 0.09);
    overflow: hidden;
    transition: transform 0.5s var(--ease-spring), border-color 0.2s, background 0.2s;
  }
  .mode::before {
    content: "";
    position: absolute;
    inset: auto -30% -50% auto;
    width: 9rem;
    height: 9rem;
    border-radius: 50%;
    background: var(--tone);
    opacity: 0.22;
    filter: blur(24px);
    transition: opacity 0.3s;
  }
  .mode:hover {
    border-color: rgb(255 255 255 / 0.18);
    transform: translateY(-3px);
  }
  .mode:hover::before {
    opacity: 0.4;
  }
  .mode:active {
    transform: scale(0.97);
  }
  .mode strong {
    margin-top: auto;
    font-family: var(--font-display);
    font-size: 1.1rem;
    letter-spacing: -0.02em;
  }
  .mode small {
    color: var(--color-muted);
    font-size: 0.82rem;
    line-height: 1.35;
  }
  .mode-icon {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.9rem;
    color: var(--ink-on, #1b1203);
    background: var(--tone);
  }
  .arrow {
    position: absolute;
    top: 1rem;
    right: 1rem;
    color: var(--color-faint);
  }
  .honey {
    --tone: linear-gradient(140deg, var(--color-honey-300), var(--color-honey-600));
  }
  .violet {
    --tone: linear-gradient(140deg, var(--color-violet-300), var(--color-violet-600));
    --ink-on: #fff;
  }
  .mint {
    --tone: linear-gradient(140deg, #9ff7dd, var(--color-mint-500));
  }
  .coral {
    --tone: linear-gradient(140deg, #ffb3c1, var(--color-coral-500));
    --ink-on: #fff;
  }
  .device {
    --tone: linear-gradient(140deg, #9ad8ff, #3b82f6);
    --ink-on: #fff;
  }
  @media (max-width: 899px) {
    .device {
      grid-column: span 2;
      min-height: auto;
    }
  }
  .rule-note {
    text-align: center;
    color: var(--color-faint);
    font-size: 0.9rem;
  }
  .footer .link {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
  }
  .footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 1rem;
    color: var(--color-faint);
    font-size: 0.85rem;
  }
</style>
