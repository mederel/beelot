<script lang="ts">
  // An on/off setting: a button with role="switch", its label and an optional line under it.
  import { sfx } from "$lib/audio/sfx";
  let { checked = $bindable(), label, hint = "", onchange, id }: { checked: boolean; label: string; hint?: string; onchange?: (on: boolean) => void; id?: string } = $props();
  function toggle() {
    checked = !checked;
    sfx.play("toggle");
    onchange?.(checked);
  }
</script>

<div class="row">
  <span class="text">
    <strong>{label}</strong>
    {#if hint}<small>{hint}</small>{/if}
  </span>
  <button {id} type="button" role="switch" aria-checked={checked} aria-label={label} class="switch" class:on={checked} onclick={toggle}><span class="knob"></span></button>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.9rem 0;
  }
  .text {
    display: grid;
    gap: 0.15rem;
  }
  strong {
    font-weight: 600;
  }
  small {
    color: var(--color-muted);
    font-size: 0.85rem;
  }
  .switch {
    position: relative;
    flex: none;
    width: 3.25rem;
    height: 2rem;
    border-radius: 99px;
    background: rgb(255 255 255 / 0.14);
    box-shadow: inset 0 1px 3px rgb(0 0 0 / 0.4);
    transition: background 0.25s;
    cursor: pointer;
  }
  .switch.on {
    background: linear-gradient(180deg, var(--color-honey-400), var(--color-honey-600));
  }
  .knob {
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.35);
    transition: translate 0.45s var(--ease-spring);
  }
  .on .knob {
    translate: 1.25rem 0;
  }
</style>
