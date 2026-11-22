<script lang="ts">
  import { fly } from "svelte/transition";
  let shown = $state(false);
  let x = $state(10);
</script>

<button class="m-4 rounded-full bg-amber-400 px-4 py-2" onclick={() => { shown = !shown; x += 20; }}>toggle</button>
{#if shown}<p transition:fly={{ y: 40 }} class="probe" style:--x="{x}px" style:color="tomato">hello</p>{/if}

<style>
  .probe { translate: var(--x) 0; }
</style>
