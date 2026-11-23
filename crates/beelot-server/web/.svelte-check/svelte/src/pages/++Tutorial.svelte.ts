///<reference types="svelte" />
;// The tutorial (US-019): four lessons, each a question with two cards. The answer is shown with its reason, the right card
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
function $$render() {

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

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
;
async () => {

 { svelteHTML.createElement("div", { "class":`page tutorial`,});
   { svelteHTML.createElement("header", { "class":`head`,});
     { svelteHTML.createElement("p", { "class":`eyebrow`,});t("Learn Belote"); }
     { svelteHTML.createElement("h1", { "class":`page-title`,});t("Tutorial"); }
   }

   { svelteHTML.createElement("section", {   "class":`course glass`,"aria-labelledby":`course-title`,});
     { svelteHTML.createElement("h2", { "id":`course-title`,});t("Coached lessons"); }
     { svelteHTML.createElement("p", { "class":`intro`,});t("Play real hands with every card face up. The coach tells you which card to play, and why not the others."); }
     { svelteHTML.createElement("ol", { "class":`lessons`,});
          for(let lesson of __sveltets_2_ensureArray(LESSONS)){let index = 1;lesson.id;
         { svelteHTML.createElement("li", {});
           { svelteHTML.createElement("span", {    "class":`number`,"aria-hidden":`true`,});done.includes(lesson.id);if(done.includes(lesson.id)){ { const $$_kcehC5C = __sveltets_2_ensureComponent(Check); new $$_kcehC5C({ target: __sveltets_2_any(), props: {  "size":16,}});}}else{index + 1;} }
           { svelteHTML.createElement("span", { "class":`what`,});
             { svelteHTML.createElement("strong", {});t(lesson.title); }
             { svelteHTML.createElement("small", {});t(lesson.goal); }
           }
           { const $$_nottuB4C = __sveltets_2_ensureComponent(Button); new $$_nottuB4C({ target: __sveltets_2_any(), props: {       children:() => { return __sveltets_2_any(0); },"size":`sm`,"variant":done.includes(lesson.id) ? "secondary" : "primary","disabled":opening,"onclick":() => open(lesson.id),}});
            t(done.includes(lesson.id) ? "Replay lesson" : "Start lesson"); { svelteHTML.createElement("span", { "class":`visually-hidden`,});  t(lesson.title); }
           Button}
         }
      }
     }
     { svelteHTML.createElement("div", { "class":`free`,});
       { svelteHTML.createElement("span", { "class":`what`,});
         { svelteHTML.createElement("strong", {});t("Free game"); }
         { svelteHTML.createElement("small", {});t("A whole game against three bots, with the coach beside you."); }
       }
       { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {       children:() => { return __sveltets_2_any(0); },"size":`sm`,"variant":`secondary`,"disabled":opening,"onclick":() => open(),}});t("Play a free game"); Button}
     }
    if(failure){ { svelteHTML.createElement("p", {   "class":`failure`,"role":`alert`,});failure; }}
   }

   { svelteHTML.createElement("h2", { "class":`quiz-title`,});t("Quick quiz"); }
   { svelteHTML.createElement("div", {   "class":`progress`,"aria-hidden":`true`,});
        for(let _ of __sveltets_2_ensureArray(steps)){let index = 1;index; { svelteHTML.createElement("span", {  });index < step;index === step; }}
   }
   { svelteHTML.createElement("p", { "class":`count`,});t("Lesson {0} of {1}", step + 1, steps.length); }

  step; {
     { svelteHTML.createElement("section", {   "class":`lesson glass`,});__sveltets_2_ensureTransition(fly(svelteHTML.mapElementTag('section'),({ x: settings.effects === "full" ? 40 : 0, duration: 380 })));
       { svelteHTML.createElement("h2", {});t(lesson.title); }
       { svelteHTML.createElement("p", { "class":`prompt`,}); { const $$_txeTtiuS3C = __sveltets_2_ensureComponent(SuitText); new $$_txeTtiuS3C({ target: __sveltets_2_any(), props: {  "text":t(lesson.prompt),}});} }
       { svelteHTML.createElement("div", { "class":`choices`,});
            for(let card of __sveltets_2_ensureArray(lesson.cards)){let index = 1;index;
           { svelteHTML.createElement("button", {         "type":`button`,"class":`choice`,"onclick":() => choose(index),});chosen !== null && index === lesson.correct;chosen === index && index !== lesson.correct;
             { const $$_draCgniyalP4C = __sveltets_2_ensureComponent(PlayingCard); new $$_draCgniyalP4C({ target: __sveltets_2_any(), props: { card,}});}
           }
        }
       }
       { svelteHTML.createElement("p", {   "class":`feedback`,"role":`status`,});
        if(chosen === null){
           { const $$_txeTtiuS3C = __sveltets_2_ensureComponent(SuitText); new $$_txeTtiuS3C({ target: __sveltets_2_any(), props: {  "text":t("Choose a card to continue."),}});}
        }else{
           { svelteHTML.createElement("span", {    "class":`answer`,});chosen === lesson.correct;__sveltets_2_ensureTransition(scale(svelteHTML.mapElementTag('span'),({ start: 0.9, duration: 250 })));
             { const $$_eeB4C = __sveltets_2_ensureComponent(Bee); new $$_eeB4C({ target: __sveltets_2_any(), props: {    "size":`2rem`,"flutter":false,}});}
             { const $$_txeTtiuS4C = __sveltets_2_ensureComponent(SuitText); new $$_txeTtiuS4C({ target: __sveltets_2_any(), props: {  "text":t(chosen === lesson.correct ? lesson.feedback : "Not quite. Look at the highlighted card, then try the next lesson."),}});}
           }
        }
       }
     }
  }

   { svelteHTML.createElement("div", { "class":`actions`,});
     { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"size":`lg`,"disabled":chosen === null,"onclick":next,}});t(last ? "Finish tutorial" : "Next lesson");  { const $$_thgiRworrA3C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA3C({ target: __sveltets_2_any(), props: {    "size":18,"aria-hidden":`true`,}});} Button}
     { const $$_nottuB2C = __sveltets_2_ensureComponent(Button); new $$_nottuB2C({ target: __sveltets_2_any(), props: {   children:() => { return __sveltets_2_any(0); },"variant":`ghost`,"onclick":replay,}}); { const $$_wcCetatoR3C = __sveltets_2_ensureComponent(RotateCcw); new $$_wcCetatoR3C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Replay tutorial"); Button}
   }
 }


};
return { props: {} as Record<string, never>, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Tutorial__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Tutorial__SvelteComponent_ = ReturnType<typeof Tutorial__SvelteComponent_>;
/*Ωignore_endΩ*/export default Tutorial__SvelteComponent_;