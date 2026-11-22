<script lang="ts">
  // A seat's face. A bot has its character, drawn flat for the redesign, with one of five expressions (US-088): neutral,
  // thinking, pleased, annoyed and celebrating; a change of expression bounces. A human has the initial of their name on
  // their team's colour.
  import { botCharacter } from "$lib/models/bots";
  import { playerName } from "$lib/i18n/i18n.svelte";

  let { name, expression = "neutral", team = 0, size = "3rem" }: { name: string; expression?: string; team?: number; size?: string } = $props();

  const character = $derived(botCharacter(name)?.key ?? null);
  const initial = $derived(playerName(name).trim().slice(0, 1).toUpperCase() || "?");

  const LOOKS: Record<string, { bg: [string, string]; skin: string; hair: string }> = {
    camille: { bg: ["#ff9db5", "#ff5c7a"], skin: "#f6c7a5", hair: "#5b2a1d" },
    luc: { bg: ["#7ee8c8", "#22b58a"], skin: "#e7b48f", hair: "#2a1d14" },
    manon: { bg: ["#b9a6ff", "#6d4dff"], skin: "#c98f6b", hair: "#15121f" },
    hugo: { bg: ["#ffd88a", "#ff9f1c"], skin: "#f0c09a", hair: "#8a5a2b" }
  };
  const look = $derived(character ? LOOKS[character] : null);
</script>

{#if character && look}
  <svg class="avatar" viewBox="0 0 64 64" style:--size={size} aria-hidden="true" data-expression={expression}>
    <defs>
      <linearGradient id="bg-{character}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color={look.bg[0]} />
        <stop offset="1" stop-color={look.bg[1]} />
      </linearGradient>
      <clipPath id="clip-{character}"><circle cx="32" cy="32" r="32" /></clipPath>
    </defs>
    <g clip-path="url(#clip-{character})">
      <rect width="64" height="64" fill="url(#bg-{character})" />
      <path d="M10 64c2-12 11-18 22-18s20 6 22 18z" fill="#fff" opacity=".9" />
      {#if character === "camille"}
        <circle cx="32" cy="27" r="19" fill={look.hair} />
        <circle cx="16" cy="34" r="8" fill={look.hair} />
        <circle cx="48" cy="34" r="8" fill={look.hair} />
      {:else if character === "manon"}
        <path d="M13 40V27a19 19 0 0 1 38 0v13z" fill={look.hair} />
      {/if}
      <ellipse cx="32" cy="31" rx="13.5" ry="15" fill={look.skin} />
      {#if character === "camille"}
        <path d="M18 26c3-8 9-11 14-11s11 3 14 11c-6-3-12-4-14-8-3 4-8 6-14 8z" fill={look.hair} />
        <rect x="21" y="27.5" width="9" height="6" rx="3" fill="none" stroke="#241a05" stroke-width="1.6" />
        <rect x="34" y="27.5" width="9" height="6" rx="3" fill="none" stroke="#241a05" stroke-width="1.6" />
        <path d="M30 30h4" stroke="#241a05" stroke-width="1.6" />
      {:else if character === "luc"}
        <path d="M17 25c0-8 7-13 15-13s15 5 15 13z" fill="#ff5c7a" />
        <path d="M30 24h22c1 0 1 3-1 3H31z" fill="#e0243c" />
        <circle cx="32" cy="12.5" r="2" fill="#fff" />
      {:else if character === "manon"}
        <path d="M18.5 30c0-10 6-15 13.5-15s13.5 5 13.5 15c-4-6-9-8-13.5-8s-9.5 2-13.5 8z" fill={look.hair} />
      {:else}
        <path d="M18.5 27c1-8 7-12 13.5-12s12.5 4 13.5 12c-3-3-7-5-13.5-5s-10.5 2-13.5 5z" fill={look.hair} />
        <path d="M19 33c1 9 6 13 13 13s12-4 13-13c-2 3-5 5-7 5h-12c-2 0-5-2-7-5z" fill={look.hair} />
      {/if}
      {#key expression}
      <g class="face">
        {#if expression === "pleased" || expression === "celebrating"}
          <path d="M22.5 31q3-3 6 0M35.5 31q3-3 6 0" fill="none" stroke="#241a05" stroke-width="2" stroke-linecap="round" />
        {:else if expression === "annoyed"}
          <path d="M22.5 29.5l6 1.5M41.5 29.5l-6 1.5" stroke="#241a05" stroke-width="2" stroke-linecap="round" />
          <circle cx="25.5" cy="32.5" r="1.6" fill="#241a05" />
          <circle cx="38.5" cy="32.5" r="1.6" fill="#241a05" />
        {:else if expression === "thinking"}
          <circle cx="26.5" cy="30" r="1.8" fill="#241a05" />
          <circle cx="39.5" cy="30" r="1.8" fill="#241a05" />
          <path d="M35.5 26.5q3-1.5 6 0" fill="none" stroke="#241a05" stroke-width="1.6" stroke-linecap="round" />
        {:else}
          <circle cx="25.5" cy="31" r="1.9" fill="#241a05" />
          <circle cx="38.5" cy="31" r="1.9" fill="#241a05" />
        {/if}
        {#if expression === "pleased"}
          <path d="M27 38q5 4 10 0" fill="none" stroke="#241a05" stroke-width="2" stroke-linecap="round" />
        {:else if expression === "celebrating"}
          <path d="M26 37h12q-1 7-6 7t-6-7z" fill="#7a1f2b" stroke="#241a05" stroke-width="1.6" stroke-linejoin="round" />
        {:else if expression === "annoyed"}
          <path d="M27.5 40q4.5-3 9 0" fill="none" stroke="#241a05" stroke-width="2" stroke-linecap="round" />
        {:else if expression === "thinking"}
          <circle cx="35" cy="39" r="1.8" fill="none" stroke="#241a05" stroke-width="1.6" />
        {:else}
          <path d="M28.5 38.5h7" stroke="#241a05" stroke-width="2" stroke-linecap="round" />
        {/if}
        <ellipse cx="21" cy="36" rx="2.4" ry="1.4" fill="#ff5c7a" opacity=".35" />
        <ellipse cx="43" cy="36" rx="2.4" ry="1.4" fill="#ff5c7a" opacity=".35" />
      </g>
      {/key}
    </g>
  </svg>
{:else}
  <span class="avatar human" class:east-west={team === 1} style:--size={size} aria-hidden="true">{initial}</span>
{/if}

<style>
  .avatar {
    display: block;
    width: var(--size);
    height: var(--size);
    flex: none;
    border-radius: 50%;
  }
  :global([data-effects="full"]) svg.avatar .face {
    animation: express 0.45s var(--ease-spring);
    transform-origin: 32px 34px;
  }
  @keyframes express {
    from { scale: 0.86; }
  }
  .human {
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: calc(var(--size) * 0.45);
    color: #1b1203;
    background: linear-gradient(140deg, var(--color-honey-300), var(--color-honey-600));
  }
  .human.east-west {
    color: #fff;
    background: linear-gradient(140deg, var(--color-violet-400), var(--color-violet-600));
  }
</style>
