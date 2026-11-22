<script lang="ts">
  // The help sheet (US-123): the hint when the table has one, the card order and the rules, a link to the tutorial.
  import { Lightbulb, GraduationCap } from "@lucide/svelte";
  import { t } from "$lib/i18n/i18n.svelte";
  import { navigate, route } from "$lib/stores/router.svelte";
  import { help } from "$lib/stores/sheets.svelte";
  import Sheet from "$lib/ui/Sheet.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Rules from "./Rules.svelte";

  // /rules opens the sheet over home; closing it leaves the address.
  $effect(() => {
    if (route().sheet === "help" && !help.open) {
      help.routed = true;
      help.hint = null;
      help.onClose = null;
      help.open = true;
    }
  });

  function closed(reason: string) {
    const after = help.onClose;
    help.onClose = null;
    if (help.routed && reason === "closed") navigate("/", { replace: true });
    help.routed = false;
    after?.(reason);
  }
</script>

<Sheet bind:open={help.open} labelledby="help-title" backCloses={!help.routed} onclose={closed} wide>
  <header class="head">
    <p class="eyebrow">{t("Help")}</p>
    <h2 id="help-title">{t("Rules reference")}</h2>
  </header>
  {#if help.hint}
    {@const hint = help.hint}
    <Button block onclick={() => { help.open = false; hint(); }}><Lightbulb size={18} aria-hidden="true" />{t("Ask for a hint")}</Button>
  {/if}
  <div class="body"><Rules /></div>
  <Button variant="secondary" block href="/tutorial"><GraduationCap size={18} aria-hidden="true" />{t("Learn the basics")}</Button>
</Sheet>

<style>
  .head {
    margin: 0.25rem 0 1rem;
  }
  h2 {
    font-size: 1.75rem;
    font-weight: 750;
  }
  .body {
    margin: 1.25rem 0;
  }
</style>
