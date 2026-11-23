<script lang="ts">
  // The tutorial (US-019): four lessons, each a question with two cards. The answer is shown with its reason, the right card
  // lights up, and finishing the last lesson marks the tutorial as seen (US-104).
  import { ArrowRight, Check, RotateCcw } from "@lucide/svelte";
  import { api } from "$lib/api/client";
  import { LESSONS } from "$lib/models/coach";
  import { navigate } from "$lib/stores/router.svelte";
  import { local } from "$lib/storage";
  import { fly, scale } from "svelte/transition";
  import { sfx } from "$lib/audio/sfx";
  import { t } from "$lib/i18n/i18n.svelte";
  import { lessonsDone, markTutorialSeen } from "$lib/models/prefs";
  import { refreshTutorialBanner } from "$lib/stores/account.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import Button from "$lib/ui/Button.svelte";
  import PlayingCard from "$lib/cards/PlayingCard.svelte";
  import SuitText from "$lib/ui/SuitText.svelte";
  import Bee from "$lib/brand/Bee.svelte";
  import type { Suit } from "$lib/api/types";

  const steps: { title: string; prompt: string; cards: { rank: string; suit: Suit }[]; correct: number; feedback: string }[] = [
    { title: "Trump wins", prompt: "Hearts are trump. Which card is strongest?", cards: [{ rank: "A", suit: "HEARTS" }, { rank: "J", suit: "HEARTS" }], correct: 1, feedback: "Correct. At trump, the jack is the strongest card." },
    { title: "Normal card strength", prompt: "Clubs are not trump. Which card wins this trick?", cards: [{ rank: "10", suit: "CLUBS" }, { rank: "A", suit: "CLUBS" }], correct: 1, feedback: "Correct. Outside trump, ace is stronger than 10." },
    { title: "Follow suit", prompt: "Hearts were led. Which card must you play if these are your choices?", cards: [{ rank: "7", suit: "HEARTS" }, { rank: "J", suit: "SPADES" }], correct: 0, feedback: "Correct. You must follow the lead suit when you can." },
    { title: "Take the trick", prompt: "Spades are trump and clubs were led. Which card takes this trick?", cards: [{ rank: "A", suit: "CLUBS" }, { rank: "7", suit: "SPADES" }], correct: 1, feedback: "Correct. A trump card beats cards in the lead suit." }
  ];

  // The coached lessons (US-199): each opens a table where every hand is face up and a coach says which card to play.
  const done = lessonsDone(local);
  let opening = $state(false);
  let failure = $state("");

  async function open(lesson?: string) {
    if (opening) return;
    opening = true;
    failure = "";
    try {
      const access = await api.createTutorial(lesson);
      navigate(`/play/bot/game/${access.tableId}`);
    } catch (error) {
      failure = (error as Error).message;
    } finally {
      opening = false;
    }
  }

  let step = $state(0);
  let chosen = $state<number | null>(null);
  const lesson = $derived(steps[step]);
  const last = $derived(step === steps.length - 1);

  function choose(index: number) {
    chosen = index;
    sfx.play(index === lesson.correct ? "correct" : "wrong");
  }

  function next() {
    if (last) {
      markTutorialSeen(local);
      refreshTutorialBanner();
    }
    step = (step + 1) % steps.length;
    chosen = null;
  }

  function replay() {
    step = 0;
    chosen = null;
  }
</script>

<div class="page tutorial">
  <header class="head">
    <p class="eyebrow">{t("Learn Belote")}</p>
    <h1 class="page-title">{t("Tutorial")}</h1>
  </header>

  <section class="course glass" aria-labelledby="course-title">
    <h2 id="course-title">{t("Coached lessons")}</h2>
    <p class="intro">{t("Play real hands with every card face up. The coach tells you which card to play, and why not the others.")}</p>
    <ol class="lessons">
      {#each LESSONS as lesson, index (lesson.id)}
        <li>
          <span class="number" class:finished={done.includes(lesson.id)} aria-hidden="true">{#if done.includes(lesson.id)}<Check size={16} />{:else}{index + 1}{/if}</span>
          <span class="what">
            <strong>{t(lesson.title)}</strong>
            <small>{t(lesson.goal)}</small>
          </span>
          <Button size="sm" variant={done.includes(lesson.id) ? "secondary" : "primary"} disabled={opening} onclick={() => open(lesson.id)}>
            {t(done.includes(lesson.id) ? "Replay lesson" : "Start lesson")}<span class="visually-hidden"> — {t(lesson.title)}</span>
          </Button>
        </li>
      {/each}
    </ol>
    <div class="free">
      <span class="what">
        <strong>{t("Free game")}</strong>
        <small>{t("A whole game against three bots, with the coach beside you.")}</small>
      </span>
      <Button size="sm" variant="secondary" disabled={opening} onclick={() => open()}>{t("Play a free game")}</Button>
    </div>
    {#if failure}<p class="failure" role="alert">{failure}</p>{/if}
  </section>

  <h2 class="quiz-title">{t("Quick quiz")}</h2>
  <div class="progress" aria-hidden="true">
    {#each steps as _, index (index)}<span class:done={index < step} class:current={index === step}></span>{/each}
  </div>
  <p class="count">{t("Lesson {0} of {1}", step + 1, steps.length)}</p>

  {#key step}
    <section class="lesson glass" in:fly={{ x: settings.effects === "full" ? 40 : 0, duration: 380 }}>
      <h2>{t(lesson.title)}</h2>
      <p class="prompt"><SuitText text={t(lesson.prompt)} /></p>
      <div class="choices">
        {#each lesson.cards as card, index (index)}
          <button
            type="button"
            class="choice"
            class:right={chosen !== null && index === lesson.correct}
            class:wrong={chosen === index && index !== lesson.correct}
            onclick={() => choose(index)}
          >
            <PlayingCard {card} />
          </button>
        {/each}
      </div>
      <p class="feedback" role="status">
        {#if chosen === null}
          <SuitText text={t("Choose a card to continue.")} />
        {:else}
          <span class="answer" class:good={chosen === lesson.correct} in:scale={{ start: 0.9, duration: 250 }}>
            <Bee size="2rem" flutter={false} />
            <SuitText text={t(chosen === lesson.correct ? lesson.feedback : "Not quite. Look at the highlighted card, then try the next lesson.")} />
          </span>
        {/if}
      </p>
    </section>
  {/key}

  <div class="actions">
    <Button size="lg" disabled={chosen === null} onclick={next}>{t(last ? "Finish tutorial" : "Next lesson")} <ArrowRight size={18} aria-hidden="true" /></Button>
    <Button variant="ghost" onclick={replay}><RotateCcw size={16} aria-hidden="true" />{t("Replay tutorial")}</Button>
  </div>
</div>

<style>
  .course {
    display: grid;
    gap: 0.75rem;
    padding: 1.25rem 1rem;
    border-radius: 1.6rem;
  }
  .course h2,
  .quiz-title {
    font-size: 1.3rem;
    font-weight: 750;
  }
  .intro {
    color: rgb(246 243 255 / 0.85);
  }
  .lessons {
    display: grid;
    gap: 0.5rem;
    list-style: none;
    padding: 0;
  }
  .lessons li,
  .free {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.65rem;
  }
  .free {
    grid-template-columns: 1fr auto;
  }
  .number {
    display: grid;
    place-items: center;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.1);
    font-weight: 700;
    font-size: 0.85rem;
  }
  .number.finished {
    background: var(--color-honey-500);
    color: #1b1203;
  }
  .what {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }
  .what small {
    color: var(--color-faint);
    font-size: 0.8rem;
  }
  .failure {
    color: var(--color-honey-400);
    font-weight: 600;
  }
  .tutorial {
    display: grid;
    gap: 1rem;
    max-width: 40rem;
  }
  .progress {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4rem;
  }
  .progress span {
    height: 0.35rem;
    border-radius: 99px;
    background: rgb(255 255 255 / 0.1);
    transition: background 0.4s;
  }
  .progress .done {
    background: var(--color-honey-500);
  }
  .progress .current {
    background: linear-gradient(90deg, var(--color-honey-500), rgb(255 255 255 / 0.15));
  }
  .count {
    color: var(--color-faint);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .lesson {
    display: grid;
    gap: 1rem;
    padding: 1.5rem 1.25rem;
    border-radius: 1.6rem;
  }
  h2 {
    font-size: 1.6rem;
    font-weight: 750;
  }
  .prompt {
    font-size: 1.1rem;
    color: rgb(246 243 255 / 0.9);
  }
  .choices {
    display: flex;
    justify-content: center;
    gap: 1.25rem;
    padding: 0.75rem 0;
    --cw: clamp(6rem, 30vw, 8rem);
  }
  .choice {
    border-radius: 0.9rem;
    transition: transform 0.5s var(--ease-spring), box-shadow 0.3s, opacity 0.3s;
  }
  .choice:hover {
    transform: translateY(-6px) rotate(-2deg);
  }
  .choice.right {
    transform: translateY(-10px) scale(1.04);
    box-shadow: 0 0 0 3px var(--color-mint-400), 0 0 40px rgb(79 240 189 / 0.45);
  }
  .choice.wrong {
    opacity: 0.55;
    animation: shake 0.4s;
  }
  @keyframes shake {
    25% { translate: -6px 0; }
    75% { translate: 6px 0; }
  }
  .feedback {
    min-height: 3rem;
    color: var(--color-muted);
  }
  .answer {
    display: flex;
    gap: 0.7rem;
    align-items: center;
    color: var(--color-coral-400);
    font-weight: 600;
  }
  .answer.good {
    color: var(--color-mint-400);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
</style>
