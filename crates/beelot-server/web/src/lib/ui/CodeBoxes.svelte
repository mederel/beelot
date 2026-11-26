<script lang="ts">
  // The six boxes of an invitation code (US-124): one character each, a paste spreads over the boxes, Backspace in an
  // empty box goes back.
  import { t } from "$lib/i18n/i18n.svelte";
  import { boxAfterBackspace, CODE_LENGTH, joinedCode, normalizeCode, spreadCode } from "$lib/models/small";

  let { value = $bindable(""), labelledby }: { value: string; labelledby: string } = $props();
  let boxes = $state(Array.from({ length: CODE_LENGTH }, () => ""));
  const inputs: HTMLInputElement[] = [];

  // A code set from outside (an invite link, US-212) fills the boxes.
  $effect(() => {
    if (value !== joinedCode(boxes)) boxes = spreadCode([], 0, normalizeCode(value));
  });

  function input(index: number, event: Event) {
    const typed = normalizeCode((event.currentTarget as HTMLInputElement).value);
    // The boxes as they are on screen: a character just deleted from this one is gone, and stays gone.
    boxes = spreadCode(
      inputs.map((box) => box?.value ?? ""),
      index,
      typed
    );
    for (let i = 0; i < CODE_LENGTH; i += 1) if (inputs[i]) inputs[i].value = boxes[i];
    value = joinedCode(boxes);
    inputs[typed ? Math.min(index + typed.length, CODE_LENGTH - 1) : index]?.focus();
  }

  function keydown(index: number, event: KeyboardEvent) {
    if (event.key !== "Backspace") return;
    const target = boxAfterBackspace(index, boxes);
    if (target !== index) {
      event.preventDefault();
      inputs[target]?.focus();
    }
  }
</script>

<div class="boxes" role="group" aria-labelledby={labelledby}>
  {#each boxes as box, index (index)}
    <input
      bind:this={inputs[index]}
      class="box"
      class:filled={box !== ""}
      type="text"
      maxlength={CODE_LENGTH}
      required
      autocomplete="off"
      autocapitalize="characters"
      inputmode="text"
      aria-label={t("Character {0} of 6", index + 1)}
      value={box}
      oninput={(event) => input(index, event)}
      onkeydown={(event) => keydown(index, event)}
    />
  {/each}
</div>

<style>
  .boxes {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.25rem;
  }
  .box {
    width: 100%;
    min-width: 0;
    aspect-ratio: 4 / 5;
    max-height: 3.6rem;
    border-radius: 0.8rem;
    text-align: center;
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 800;
    text-transform: uppercase;
    color: var(--color-ink);
    background: rgb(7 6 15 / 0.55);
    border: 1.5px solid rgb(255 255 255 / 0.12);
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.35s var(--ease-spring);
  }
  .box:focus {
    outline: none;
    border-color: var(--color-honey-400);
    box-shadow: 0 0 0 4px rgb(255 194 46 / 0.18);
  }
  .box.filled {
    border-color: rgb(255 194 46 / 0.5);
    transform: scale(1.04);
  }
</style>
