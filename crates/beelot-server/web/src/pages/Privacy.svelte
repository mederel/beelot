<script lang="ts">
  // The privacy policy (US-129): one file in the three languages, filled with the operator's values from the server.
  import { onMount } from "svelte";
  import { apiJson } from "$lib/api/client";
  import { language, t } from "$lib/i18n/i18n.svelte";
  import { policyView } from "$lib/models/privacy";

  let policy = $state<any>(null);
  let info = $state<any>({});

  onMount(async () => {
    // The wrapper shows the connection note when a request fails; the page keeps what it has.
    const [policyAnswer, infoAnswer] = await Promise.allSettled([apiJson("/privacy-policy.json"), apiJson("/api/privacy/policy-info")]);
    if (policyAnswer.status === "fulfilled") policy = policyAnswer.value;
    if (infoAnswer.status === "fulfilled") info = infoAnswer.value;
  });

  const view = $derived(policy ? policyView(policy, info, language(), t("not configured")) : null);
</script>

<div class="page privacy">
  <header class="head">
    <p class="eyebrow">{t("How we handle your data")}</p>
    <h1 class="page-title">{t("Privacy policy")}</h1>
  </header>
  {#if view}
    <article class="glass doc">
      <p class="intro">{view.intro}</p>
      {#each view.sections as section (section.id)}
        <section id="privacy-{section.id}">
          <h2>{section.heading}</h2>
          {#each section.paragraphs as paragraph, index (index)}<p>{paragraph}</p>{/each}
          {#if section.items.length}<ul>{#each section.items as item, index (index)}<li>{item}</li>{/each}</ul>{/if}
        </section>
      {/each}
    </article>
  {/if}
</div>

<style>
  .privacy {
    display: grid;
    gap: 1rem;
    max-width: 50rem;
  }
  .head {
    display: grid;
    gap: 0.6rem;
  }
  .doc {
    display: grid;
    gap: 1.4rem;
    padding: 1.5rem 1.25rem;
    border-radius: 1.5rem;
    line-height: 1.6;
  }
  .intro {
    color: var(--color-muted);
  }
  h2 {
    font-size: 1.15rem;
    margin-bottom: 0.4rem;
    color: var(--color-honey-300);
  }
  p + p {
    margin-top: 0.5rem;
  }
  ul {
    margin-top: 0.5rem;
    padding-left: 1.2rem;
    list-style: disc;
  }
  li + li {
    margin-top: 0.25rem;
  }
</style>
