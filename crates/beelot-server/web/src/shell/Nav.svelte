<script lang="ts">
  // The four tabs (US-117): a floating glass dock at the bottom of a phone, a rail on the left from 1024 px. A highlight
  // slides to the tab of the page; there is none at a table.
  import { CircleUserRound, Spade, Trophy, Users } from "@lucide/svelte";
  import { t } from "$lib/i18n/i18n.svelte";
  import { tabs, type Tab } from "$lib/models/routes";
  import Logo from "$lib/brand/Logo.svelte";

  let { current }: { current: Tab | null } = $props();
  const icons = { play: Spade, crew: Users, progress: Trophy, me: CircleUserRound };
  const index = $derived(Math.max(0, tabs.findIndex((tab) => tab.id === current)));
</script>

<nav class="nav" aria-label={t("Main")} style:--index={index}>
  <a class="brand" href="/" aria-label={t("Beelot home")}><Logo size="md" /></a>
  <div class="tabs">
    <span class="highlight" aria-hidden="true"></span>
    {#each tabs as tab (tab.id)}
      {@const Icon = icons[tab.id]}
      <a class="tab" href={tab.href} aria-current={tab.id === current ? "page" : undefined}>
        <Icon size={22} strokeWidth={tab.id === current ? 2.6 : 2} aria-hidden="true" />
        <span>{t(tab.label)}</span>
      </a>
    {/each}
  </div>
</nav>

<style>
  .nav {
    position: fixed;
    z-index: 40;
    left: 50%;
    bottom: max(0.75rem, env(safe-area-inset-bottom));
    translate: -50% 0;
    width: min(26rem, calc(100% - 1.5rem));
  }
  .brand {
    display: none;
  }
  .tabs {
    position: relative;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 0.4rem;
    border-radius: 1.6rem;
    background: linear-gradient(180deg, rgb(32 28 62 / 0.78), rgb(16 14 32 / 0.86));
    border: 1px solid rgb(255 255 255 / 0.1);
    box-shadow: 0 18px 40px -12px rgb(0 0 0 / 0.85), inset 0 1px 0 rgb(255 255 255 / 0.08);
    backdrop-filter: blur(22px) saturate(160%);
    -webkit-backdrop-filter: blur(22px) saturate(160%);
  }
  .highlight {
    position: absolute;
    top: 0.4rem;
    bottom: 0.4rem;
    left: 0.4rem;
    width: calc((100% - 0.8rem) / 4);
    border-radius: 1.2rem;
    background: linear-gradient(180deg, rgb(255 194 46 / 0.22), rgb(255 159 28 / 0.1));
    box-shadow: inset 0 0 0 1px rgb(255 194 46 / 0.35);
    translate: calc(var(--index) * 100%) 0;
    transition: translate 0.55s var(--ease-spring);
  }
  .tab {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.5rem 0 0.4rem;
    border-radius: 1.2rem;
    color: var(--color-muted);
    font-size: 0.72rem;
    font-weight: 600;
    text-decoration: none;
    transition: color 0.2s, transform 0.4s var(--ease-spring);
  }
  .tab:active {
    transform: scale(0.92);
  }
  .tab[aria-current="page"] {
    color: var(--color-honey-300);
  }
  @media (min-width: 1024px) {
    .nav {
      left: 0;
      top: 0;
      bottom: 0;
      translate: none;
      width: 15rem;
      padding: 1.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 2rem;
      border-right: 1px solid rgb(255 255 255 / 0.06);
      background: linear-gradient(180deg, rgb(16 14 32 / 0.6), rgb(11 10 20 / 0.4));
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }
    .brand {
      display: block;
      padding: 0 0.75rem;
      text-decoration: none;
    }
    .tabs {
      grid-template-columns: 1fr;
      gap: 0.25rem;
      padding: 0;
      background: none;
      border: 0;
      box-shadow: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    .highlight {
      top: 0;
      left: 0;
      bottom: auto;
      width: 100%;
      height: 3.25rem;
      translate: 0 calc(var(--index) * (3.25rem + 0.25rem));
    }
    .tab {
      flex-direction: row;
      gap: 0.85rem;
      height: 3.25rem;
      padding: 0 1rem;
      font-size: 1rem;
    }
    .tab:hover:not([aria-current="page"]) {
      color: var(--color-ink);
      background: rgb(255 255 255 / 0.05);
    }
  }
</style>
