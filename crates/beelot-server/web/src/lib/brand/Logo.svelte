<script lang="ts">
  // The wordmark: the bee and "beelot" in Bricolage, honey on night. Live text, so it is crisp at every size.
  import Bee from "./Bee.svelte";
  let { size = "md" }: { size?: "sm" | "md" | "lg" } = $props();
</script>

<span class="logo {size}">
  <Bee size="1.35em" flutter={size === "lg"} />
  <span class="word">beelot</span>
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 0.28em;
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: -0.045em;
    line-height: 1;
  }
  .sm {
    font-size: 1.35rem;
  }
  .md {
    font-size: 1.75rem;
  }
  .lg {
    font-size: clamp(2.4rem, 9vw, 3.4rem);
  }
  .word {
    background: linear-gradient(180deg, #fff6d9 0%, var(--color-honey-400) 55%, var(--color-honey-600) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    padding-bottom: 0.06em;
  }
</style>
