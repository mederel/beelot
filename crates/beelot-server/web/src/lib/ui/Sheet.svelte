<script lang="ts">
  // A sheet on a native <dialog>: a bottom sheet on phones, a centred panel from 720 px. The browser traps the focus and
  // makes the page behind inert. It closes with Escape, a tap on the backdrop, the close button or a drag down on the
  // grabber, unless `dismissible` is false (the pass-and-play cover). With `backCloses`, opening it adds a history entry,
  // so the Back button closes it before it leaves the page (US-118). `onclose(reason)` says why it closed.
  import type { Snippet } from "svelte";
  import { X } from "@lucide/svelte";
  import { t } from "$lib/i18n/i18n.svelte";
  import { onBeforeNavigate, onPopState } from "$lib/stores/router.svelte";
  import { settings } from "$lib/stores/settings.svelte";

  type Reason = "closed" | "back" | "navigated";

  interface Props {
    open: boolean;
    label?: string;
    labelledby?: string;
    describedby?: string;
    dismissible?: boolean;
    backCloses?: boolean;
    closeButton?: boolean;
    variant?: "sheet" | "dialog" | "cover";
    wide?: boolean;
    class?: string;
    onclose?: (reason: Reason) => void;
    children: Snippet;
  }

  let {
    open = $bindable(),
    label,
    labelledby,
    describedby,
    dismissible = true,
    backCloses = false,
    closeButton = true,
    variant = "sheet",
    wide = false,
    class: extra = "",
    onclose,
    children
  }: Props = $props();

  let dialog: HTMLDialogElement;
  let panel: HTMLDivElement;
  const id = Math.random().toString(36).slice(2);
  let pushed = false;
  let closing = false;
  let opener: HTMLElement | null = null;

  const animated = () => settings.effects !== "off";
  const phone = () => window.matchMedia("(max-width: 719px)").matches;

  function show() {
    if (!dialog || dialog.open) return;
    opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    if (backCloses) {
      history.pushState({ beelotSheet: id }, "", location.href);
      pushed = true;
    }
    if (animated()) {
      const full = settings.effects === "full";
      const from = variant === "sheet" && phone() ? { transform: full ? "translateY(100%)" : "translateY(0)", opacity: full ? 1 : 0 } : { transform: full ? "scale(0.94) translateY(12px)" : "scale(1)", opacity: 0 };
      panel.animate([from, { transform: "none", opacity: 1 }], { duration: full ? 460 : 180, easing: full ? "cubic-bezier(0.2, 0.9, 0.25, 1.05)" : "ease-out" });
      dialog.animate([{ backgroundColor: "rgb(4 3 10 / 0)" }, { backgroundColor: "rgb(4 3 10 / 0.6)" }], { duration: 260, easing: "ease-out" });
    }
  }

  async function hide(reason: Reason) {
    if (!dialog?.open || closing) return;
    closing = true;
    if (animated()) {
      const full = settings.effects === "full";
      const to = variant === "sheet" && phone() && full ? { transform: "translateY(100%)" } : { transform: full ? "scale(0.96)" : "none", opacity: 0 };
      const animation = panel.animate([{ transform: getComputedStyle(panel).transform === "none" ? "none" : getComputedStyle(panel).transform }, to], { duration: full ? 240 : 140, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
      dialog.animate([{ backgroundColor: "rgb(4 3 10 / 0.6)" }, { backgroundColor: "rgb(4 3 10 / 0)" }], { duration: 240, fill: "forwards" });
      await animation.finished.catch(() => {});
      animation.cancel();
    }
    closing = false;
    // The sheet's component may be gone by now (the page changed while it closed).
    if (!dialog) return;
    dialog.close();
    dialog.getAnimations().forEach((animation) => animation.cancel());
    if (pushed) {
      pushed = false;
      if (reason !== "back" && history.state?.beelotSheet === id) history.back();
    }
    open = false;
    if (reason !== "navigated") opener?.focus?.({ preventScroll: true });
    onclose?.(reason);
  }

  export function close(reason: Reason = "closed") {
    return hide(reason);
  }

  $effect(() => {
    if (open) show();
    else if (dialog?.open) hide("closed");
  });

  $effect(() => {
    const stopPop = onPopState((state) => {
      if (!dialog?.open || !pushed) return false;
      if (state?.beelotSheet === id) return false;
      pushed = false;
      hide("back");
      return true;
    });
    const stopNavigate = onBeforeNavigate(() => {
      if (dialog?.open) {
        pushed = false;
        hide("navigated");
      }
    });
    return () => {
      stopPop();
      stopNavigate();
    };
  });

  function cancel(event: Event) {
    event.preventDefault();
    if (dismissible) hide("closed");
  }

  function backdrop(event: MouseEvent) {
    if (event.target === dialog && dismissible) hide("closed");
  }

  // Drag the grabber down to dismiss: past 110 px or a quick flick closes, otherwise it springs back.
  let dragStart = 0;
  let dragAt = 0;
  let dragTime = 0;
  function dragDown(event: PointerEvent) {
    if (!dismissible) return;
    dragStart = event.clientY;
    dragAt = 0;
    dragTime = performance.now();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function dragMove(event: PointerEvent) {
    if (!dragStart) return;
    dragAt = Math.max(0, event.clientY - dragStart);
    panel.style.setProperty("translate", `0 ${dragAt}px`);
  }
  function dragEnd() {
    if (!dragStart) return;
    const speed = dragAt / Math.max(1, performance.now() - dragTime);
    dragStart = 0;
    panel.style.removeProperty("translate");
    if (dragAt > 110 || speed > 0.8) hide("closed");
    else if (animated() && dragAt > 0) panel.animate([{ translate: `0 ${dragAt}px` }, { translate: "0 0" }], { duration: 380, easing: "cubic-bezier(0.2, 0.9, 0.25, 1.2)" });
  }
</script>

<dialog
  bind:this={dialog}
  class="sheet {variant} {extra}"
  class:wide
  aria-label={label}
  aria-labelledby={labelledby}
  aria-describedby={describedby}
  oncancel={cancel}
  onclick={backdrop}
>
  <div class="panel" bind:this={panel}>
    {#if variant === "sheet" && dismissible}
      <div class="grabber" onpointerdown={dragDown} onpointermove={dragMove} onpointerup={dragEnd} onpointercancel={dragEnd} aria-hidden="true"><span></span></div>
    {/if}
    {#if closeButton && dismissible && variant !== "cover"}
      <button class="close" type="button" aria-label={t("Close")} onclick={() => hide("closed")}><X size={20} strokeWidth={2.4} /></button>
    {/if}
    {#if open}
      {@render children()}
    {/if}
  </div>
</dialog>

<style>
  dialog {
    position: fixed;
    inset: 0;
    width: 100%;
    max-width: 100%;
    height: 100%;
    max-height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: hidden;
  }
  dialog:focus,
  dialog:focus-visible {
    outline: none;
  }
  .panel > :global(*) {
    min-width: 0;
  }
  dialog[open] {
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  dialog::backdrop {
    background: rgb(4 3 10 / 0.6);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  .panel {
    position: relative;
    width: 100%;
    max-height: min(92dvh, 100%);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.5rem 1.25rem max(1.5rem, env(safe-area-inset-bottom));
    border-radius: 1.75rem 1.75rem 0 0;
    background:
      radial-gradient(120% 60% at 50% 0%, rgb(139 108 255 / 0.18), transparent 70%),
      linear-gradient(180deg, #1c1838, #120f26);
    border: 1px solid rgb(255 255 255 / 0.1);
    border-bottom: 0;
    box-shadow: 0 -20px 60px -20px rgb(0 0 0 / 0.8), inset 0 1px 0 rgb(255 255 255 / 0.08);
    scrollbar-width: thin;
  }
  .grabber {
    display: grid;
    place-items: center;
    height: 1.6rem;
    margin: 0 -1.25rem 0.25rem;
    cursor: grab;
    touch-action: none;
  }
  .grabber span {
    width: 2.75rem;
    height: 0.3rem;
    border-radius: 99px;
    background: rgb(255 255 255 / 0.25);
  }
  .close {
    position: absolute;
    top: 0.85rem;
    right: 0.85rem;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    color: var(--color-muted);
    background: rgb(255 255 255 / 0.07);
    transition: background 0.2s, color 0.2s;
  }
  .close:hover {
    color: var(--color-ink);
    background: rgb(255 255 255 / 0.14);
  }
  @media (min-width: 720px) {
    dialog[open] {
      align-items: center;
    }
    .panel {
      width: min(34rem, calc(100% - 2rem));
      max-height: min(88dvh, 100%);
      padding: 1.75rem 1.75rem 1.75rem;
      border-radius: 1.75rem;
      border-bottom: 1px solid rgb(255 255 255 / 0.1);
    }
    .wide .panel {
      width: min(52rem, calc(100% - 2rem));
    }
    .grabber {
      display: none;
    }
  }
  .dialog[open] {
    align-items: center;
  }
  .dialog .panel {
    width: min(26rem, calc(100% - 2rem));
    border-radius: 1.75rem;
    border-bottom: 1px solid rgb(255 255 255 / 0.1);
    padding: 1.75rem 1.5rem 1.5rem;
  }
  .cover[open] {
    align-items: stretch;
  }
  .cover::backdrop {
    background: var(--color-night-950);
  }
  .cover .panel {
    width: 100%;
    max-height: 100%;
    border-radius: 0;
    border: 0;
    display: grid;
    place-items: center;
    background:
      radial-gradient(60% 40% at 50% 30%, rgb(255 194 46 / 0.18), transparent 70%),
      var(--color-night-950);
  }
</style>
