<script lang="ts" generics="T extends string | number">
  // A choice of a few options as a row of pills (radio inputs, so the arrow keys move between them and a screen reader reads
  // a radio group). The selected pill is honey; with many options the row wraps.
  import type { Snippet } from "svelte";
  import { sfx } from "$lib/audio/sfx";

  interface Option {
    value: T;
    label: string;
    disabled?: boolean;
    hidden?: boolean;
    hint?: string;
    class?: string;
  }

  interface Props {
    name: string;
    label: string;
    options: Option[];
    value: T;
    visibleLabel?: boolean;
    size?: "md" | "sm";
    onchange?: (value: T) => void;
    option?: Snippet<[Option]>;
  }

  let { name, label, options, value = $bindable(), visibleLabel = true, size = "md", onchange, option }: Props = $props();
  const labelId = `seg-${Math.random().toString(36).slice(2, 9)}`;

  function choose(next: T) {
    value = next;
    sfx.play("tap");
    onchange?.(next);
  }
</script>

<div class="segmented {size}">
  <span id={labelId} class="label" class:visually-hidden={!visibleLabel}>{label}</span>
  <div class="group" role="radiogroup" aria-labelledby={labelId}>
    {#each options as item (item.value)}
      {#if !item.hidden}
        <label class="pill {item.class ?? ''}" class:checked={item.value === value} class:disabled={item.disabled}>
          <input type="radio" {name} value={item.value} checked={item.value === value} disabled={item.disabled} onchange={() => choose(item.value)} />
          {#if option}{@render option(item)}{:else}<span>{item.label}</span>{/if}
          {#if item.hint}<small>{item.hint}</small>{/if}
        </label>
      {/if}
    {/each}
  </div>
</div>

<style>
  .group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .pill {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    padding: 0.45rem 1rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.06);
    border: 1px solid rgb(255 255 255 / 0.1);
    color: var(--color-ink);
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, color 0.2s, transform 0.4s var(--ease-spring);
  }
  .sm .pill {
    min-height: 2.4rem;
    padding: 0.35rem 0.85rem;
    font-size: 0.875rem;
  }
  .pill:hover:not(.disabled) {
    background: rgb(255 255 255 / 0.11);
  }
  .pill:active:not(.disabled) {
    transform: scale(0.95);
  }
  .pill.checked {
    color: #1b1203;
    background: linear-gradient(180deg, var(--color-honey-300), var(--color-honey-500));
    border-color: transparent;
    box-shadow: 0 6px 18px -8px rgb(255 159 28 / 0.8);
  }
  .pill.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .pill small {
    font-size: 0.7rem;
    font-weight: 500;
    opacity: 0.75;
  }
  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: inherit;
  }
  .pill:has(input:focus-visible) {
    outline: 3px solid var(--color-honey-400);
    outline-offset: 2px;
  }
</style>
