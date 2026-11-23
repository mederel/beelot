<script lang="ts">
  // The coach of a tutorial table (US-199): the other hands face up, which card to play and why, and, when the player taps
  // another legal card, why that card is not the one. A finished lesson offers the next one.
  import { ArrowRight, RotateCcw } from "@lucide/svelte";
  import { api } from "$lib/api/client";
  import { cardName, t } from "$lib/i18n/i18n.svelte";
  import { coachLines, nextLesson } from "$lib/models/coach";
  import { markLessonDone, markTutorialSeen } from "$lib/models/prefs";
  import { refreshTutorialBanner } from "$lib/stores/account.svelte";
  import { navigate } from "$lib/stores/router.svelte";
  import { local } from "$lib/storage";
  import Button from "$lib/ui/Button.svelte";
  import OpenHands from "./OpenHands.svelte";
  import type { TableGame } from "./game.svelte";

  let { game }: { game: TableGame } = $props();

  const tutorial = $derived(game.tutorial);
  const lines = $derived(tutorial ? coachLines(tutorial, game.coachTapped) : null);
  const lesson = $derived(tutorial?.lesson);
  const following = $derived(nextLesson(lesson));
  let busy = $state(false);

  // A finished lesson is remembered on the device; the last one counts the tutorial as seen (US-104).
  $effect(() => {
    if (!lesson || !tutorial?.lessonDone) return;
    markLessonDone(local, lesson);
    if (!nextLesson(lesson)) {
      markTutorialSeen(local);
      refreshTutorialBanner();
    }
  });

  async function open(id?: string) {
    if (busy) return;
    busy = true;
    try {
      const access = await api.createTutorial(id);
      navigate(`/play/bot/game/${access.tableId}`);
    } catch (error) {
      game.flash((error as Error).message);
    } finally {
      busy = false;
    }
  }
</script>

{#if tutorial}
  <section class="coach" aria-label={t("Coach")}>
    <OpenHands {game} />
    {#if tutorial.lessonDone}
      <div class="done" role="status">
        <strong>{t("Lesson complete!")}</strong>
        <div class="buttons">
          {#if following}
            <Button size="sm" disabled={busy} onclick={() => open(following)}>{t("Next lesson")} <ArrowRight size={16} aria-hidden="true" /></Button>
          {:else}
            <Button size="sm" disabled={busy} onclick={() => open()}>{t("Play a free game")} <ArrowRight size={16} aria-hidden="true" /></Button>
          {/if}
          <Button size="sm" variant="secondary" disabled={busy} onclick={() => open(lesson)}><RotateCcw size={16} aria-hidden="true" />{t("Replay lesson")}</Button>
          <Button size="sm" variant="ghost" onclick={() => navigate("/tutorial")}>{t("Back to the tutorial")}</Button>
        </div>
      </div>
    {:else if lines}
      <p class="where">
        {#if lines.heading.lesson}
          {t("Lesson {0} of {1}", lines.heading.lesson.number, lines.heading.lesson.lessons)} · {t(lines.heading.lesson.title)} · {t("Step {0} of {1}", lines.heading.lesson.step, lines.heading.lesson.steps)}
        {:else}
          {t("Free game")}
        {/if}
      </p>
      <p class="instruction">{t(lines.instruction.key, cardName(lines.instruction.card))}</p>
      <p class="why">{t(lines.why.key, cardName(lines.why.card))}</p>
      <p class="why-not" role="status" aria-live="polite">
        {#if lines.tapped}{t(lines.tapped.key, cardName(lines.tapped.best), cardName(lines.tapped.other))}{/if}
      </p>
    {:else if game.stage === "auction"}
      <p class="why">{t("Your call: take the suit if your hand is strong in it (the jack and the nine, or an ace and several cards of the suit). Otherwise pass.")}</p>
    {:else}
      <p class="why">{t("Watch the bots play: your turn comes next.")}</p>
    {/if}
  </section>
{/if}

<style>
  .coach {
    display: grid;
    gap: 0.3rem;
    padding: 0.5rem 0.65rem;
    border-radius: 1.1rem;
    background: rgb(0 0 0 / 0.38);
    border: 1px solid rgb(255 255 255 / 0.1);
    max-height: 46dvh;
    overflow-y: auto;
  }
  .where {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-honey-400);
  }
  .instruction {
    font-size: 1.05rem;
    font-weight: 750;
  }
  .why {
    font-size: 0.85rem;
    line-height: 1.35;
    color: rgb(246 243 255 / 0.9);
  }
  .why-not {
    font-size: 0.85rem;
    line-height: 1.35;
    font-weight: 600;
    color: var(--color-honey-400);
  }
  .why-not:empty {
    display: none;
  }
  .done {
    display: grid;
    gap: 0.4rem;
  }
  .done strong {
    font-size: 1.05rem;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
</style>
