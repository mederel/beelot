<script lang="ts">
  // The one button of the app: a link when it has `href`, a button otherwise. Primary is honey with a glow and is the one
  // main action of a screen; secondary is glass; ghost is text; danger is coral. It presses in on a spring.
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { sfx } from "$lib/audio/sfx";

  interface Props extends Omit<HTMLButtonAttributes, "children"> {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "lg" | "md" | "sm";
    href?: string;
    download?: boolean | string;
    block?: boolean;
    busy?: boolean;
    sound?: boolean;
    class?: string;
    element?: HTMLElement | null;
    children: Snippet;
  }

  let {
    variant = "primary",
    size = "md",
    href,
    download,
    block = false,
    busy = false,
    sound = variant === "primary",
    class: extra = "",
    element = $bindable(null),
    children,
    onclick,
    ...rest
  }: Props = $props();

  function tap(event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
    if (sound) sfx.play("tap");
    onclick?.(event);
  }
</script>

{#if href}
  <a bind:this={element} {href} {download} class="btn {variant} {size} {extra}" class:block onclick={() => sound && sfx.play("tap")} aria-disabled={rest.disabled ? "true" : undefined} {...rest as any}>
    {@render children()}
  </a>
{:else}
  <button bind:this={element} type="button" class="btn {variant} {size} {extra}" class:block class:busy disabled={rest.disabled || busy} aria-busy={busy || undefined} onclick={tap} {...rest}>
    {@render children()}
  </button>
{/if}

<style>
  .btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: 999px;
    font-weight: 650;
    letter-spacing: -0.01em;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
    user-select: none;
    transition:
      transform 0.45s var(--ease-spring),
      background 0.25s,
      box-shadow 0.25s,
      opacity 0.2s;
    -webkit-tap-highlight-color: transparent;
  }
  .btn:active:not(:disabled) {
    transform: scale(0.95);
    transition-duration: 0.08s;
  }
  .btn:disabled,
  .btn[aria-disabled="true"] {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .block {
    display: flex;
    width: 100%;
  }
  .lg {
    min-height: 3.6rem;
    padding: 0 1.8rem;
    font-size: 1.1rem;
  }
  .md {
    min-height: 3rem;
    padding: 0 1.35rem;
    font-size: 1rem;
  }
  .sm {
    min-height: 2.75rem;
    padding: 0 1rem;
    font-size: 0.9rem;
  }
  /* A full-width button is as wide as its box, so its label needs no side padding to be centred: with it, a long label made the
     box wider than a 320 px screen. */
  .block {
    padding-inline: 1rem;
  }
  .primary {
    color: #1b1203;
    background: linear-gradient(180deg, var(--color-honey-300), var(--color-honey-500) 55%, var(--color-honey-600));
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.6),
      inset 0 -2px 0 rgb(176 92 0 / 0.35),
      0 10px 28px -10px rgb(255 159 28 / 0.75);
  }
  .primary:hover:not(:disabled) {
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.6),
      inset 0 -2px 0 rgb(176 92 0 / 0.35),
      0 14px 34px -10px rgb(255 159 28 / 0.95);
  }
  /* A slow sheen across the primary button. */
  .primary::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(110deg, transparent 35%, rgb(255 255 255 / 0.45) 50%, transparent 65%) no-repeat;
    background-size: 250% 100%;
    background-position: 150% 0;
    pointer-events: none;
  }
  :global([data-effects="full"]) .primary.lg::after {
    animation: sheen 4.5s ease-in-out infinite;
  }
  @keyframes sheen {
    0%, 70% { background-position: 150% 0; }
    100% { background-position: -50% 0; }
  }
  .secondary {
    color: var(--color-ink);
    background: rgb(255 255 255 / 0.08);
    border: 1px solid rgb(255 255 255 / 0.14);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08);
  }
  .secondary:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.13);
  }
  .ghost {
    color: var(--color-honey-300);
    background: transparent;
  }
  .ghost:hover:not(:disabled) {
    background: rgb(255 194 46 / 0.1);
  }
  .danger {
    color: #fff;
    background: linear-gradient(180deg, #ff7690, var(--color-coral-500));
    box-shadow: 0 10px 24px -12px rgb(255 92 122 / 0.8);
  }
  .busy {
    color: transparent !important;
  }
  .busy::before {
    content: "";
    position: absolute;
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 50%;
    border: 2.5px solid rgb(27 18 3 / 0.25);
    border-top-color: #1b1203;
    animation: spin 0.7s linear infinite;
  }
  .secondary.busy::before,
  .ghost.busy::before {
    border-color: rgb(255 255 255 / 0.2);
    border-top-color: #fff;
  }
</style>
