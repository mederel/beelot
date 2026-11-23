<script lang="ts">
  // The bee of Beelot, redrawn flat for the redesign: a honey body with ink stripes, glassy wings that flutter at full
  // effects, and a small smile.
  let { size = "3rem", flutter = true, class: extra = "" }: { size?: string; flutter?: boolean; class?: string } = $props();
  // Each bee has its own gradient ids: the page holds several bees, and a copy that shares another's ids loses its
  // gradients when that copy sits in a hidden element (the nav's logo on a phone), so it renders black.
  const uid = $props.id();
</script>

<svg class="bee {extra}" class:flutter viewBox="0 0 64 64" style:--size={size} aria-hidden="true">
  <defs>
    <linearGradient id="{uid}-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe08a" />
      <stop offset=".55" stop-color="#ffc22e" />
      <stop offset="1" stop-color="#ff9f1c" />
    </linearGradient>
    <linearGradient id="{uid}-wing" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".95" />
      <stop offset="1" stop-color="#c7b8ff" stop-opacity=".55" />
    </linearGradient>
  </defs>
  <g class="wings">
    <ellipse class="wing left" cx="21" cy="20" rx="10" ry="14" transform="rotate(-28 21 20)" fill="url(#{uid}-wing)" />
    <ellipse class="wing right" cx="43" cy="20" rx="10" ry="14" transform="rotate(28 43 20)" fill="url(#{uid}-wing)" />
  </g>
  <path d="M26 15c-1-5-4-8-8-9M38 15c1-5 4-8 8-9" fill="none" stroke="#241a05" stroke-width="2.4" stroke-linecap="round" />
  <circle cx="18" cy="6" r="2.6" fill="#241a05" />
  <circle cx="46" cy="6" r="2.6" fill="#241a05" />
  <ellipse cx="32" cy="38" rx="17" ry="19" fill="url(#{uid}-body)" />
  <path d="M15.6 33h32.8M16 43h32M19.5 52h25" stroke="#241a05" stroke-width="5" stroke-linecap="round" />
  <circle cx="26" cy="25" r="2.4" fill="#241a05" />
  <circle cx="38" cy="25" r="2.4" fill="#241a05" />
  <path d="M28 29.5q4 3 8 0" fill="none" stroke="#241a05" stroke-width="2" stroke-linecap="round" />
  <ellipse cx="22" cy="28" rx="2.6" ry="1.6" fill="#ff8098" opacity=".55" />
  <ellipse cx="42" cy="28" rx="2.6" ry="1.6" fill="#ff8098" opacity=".55" />
</svg>

<style>
  .bee {
    width: var(--size);
    height: var(--size);
    overflow: visible;
    filter: drop-shadow(0 6px 14px rgb(255 159 28 / 0.35));
  }
  .wing {
    transform-box: fill-box;
    transform-origin: 50% 100%;
  }
  :global([data-effects="full"]) .flutter .wing.left {
    animation: flutter-left 0.18s ease-in-out infinite alternate;
  }
  :global([data-effects="full"]) .flutter .wing.right {
    animation: flutter-right 0.18s ease-in-out infinite alternate;
  }
  @keyframes flutter-left {
    to { scale: 1 0.82; }
  }
  @keyframes flutter-right {
    to { scale: 1 0.82; }
  }
</style>
