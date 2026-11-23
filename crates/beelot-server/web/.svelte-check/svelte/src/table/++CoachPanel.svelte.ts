///<reference types="svelte" />
;// The coach of a tutorial table (US-199): the other hands face up, which card to play and why, and, when the player taps
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

;type $$ComponentProps =  { game: TableGame };function $$render() {

  
  
  
  
  
  
  
  
  
  
  
  
  

  let { game }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();

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
;
async () => {

if(tutorial){
   { svelteHTML.createElement("section", {   "class":`coach`,"aria-label":t("Coach"),});
     { const $$_sdnaHnepO1C = __sveltets_2_ensureComponent(OpenHands); new $$_sdnaHnepO1C({ target: __sveltets_2_any(), props: { game,}});}
    if(tutorial.lessonDone){
       { svelteHTML.createElement("div", {   "class":`done`,"role":`status`,});
         { svelteHTML.createElement("strong", {});t("Lesson complete!"); }
         { svelteHTML.createElement("div", { "class":`buttons`,});
          if(following){
             { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"size":`sm`,"disabled":busy,"onclick":() => open(following),}});t("Next lesson");  { const $$_thgiRworrA4C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA4C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});} Button}
          }else{
             { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"size":`sm`,"disabled":busy,"onclick":() => open(),}});t("Play a free game");  { const $$_thgiRworrA4C = __sveltets_2_ensureComponent(ArrowRight); new $$_thgiRworrA4C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});} Button}
          }
           { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {       children:() => { return __sveltets_2_any(0); },"size":`sm`,"variant":`secondary`,"disabled":busy,"onclick":() => open(lesson),}}); { const $$_wcCetatoR4C = __sveltets_2_ensureComponent(RotateCcw); new $$_wcCetatoR4C({ target: __sveltets_2_any(), props: {    "size":16,"aria-hidden":`true`,}});}t("Replay lesson"); Button}
           { const $$_nottuB3C = __sveltets_2_ensureComponent(Button); new $$_nottuB3C({ target: __sveltets_2_any(), props: {     children:() => { return __sveltets_2_any(0); },"size":`sm`,"variant":`ghost`,"onclick":() => navigate("/tutorial"),}});t("Back to the tutorial"); Button}
         }
       }
    } else if (lines){
       { svelteHTML.createElement("p", { "class":`where`,});
        if(lines.heading.lesson){
          t("Lesson {0} of {1}", lines.heading.lesson.number, lines.heading.lesson.lessons);  t(lines.heading.lesson.title);  t("Step {0} of {1}", lines.heading.lesson.step, lines.heading.lesson.steps);
        }else{
          t("Free game");
        }
       }
       { svelteHTML.createElement("p", { "class":`instruction`,});t(lines.instruction.key, cardName(lines.instruction.card)); }
       { svelteHTML.createElement("p", { "class":`why`,});t(lines.why.key, cardName(lines.why.card)); }
       { svelteHTML.createElement("p", {     "class":`why-not`,"role":`status`,"aria-live":`polite`,});
        if(lines.tapped){t(lines.tapped.key, cardName(lines.tapped.best), cardName(lines.tapped.other));}
       }
    } else if (game.stage === "auction"){
       { svelteHTML.createElement("p", { "class":`why`,});t("Your call: take the suit if your hand is strong in it (the jack and the nine, or an ace and several cards of the suit). Otherwise pass."); }
    }else{
       { svelteHTML.createElement("p", { "class":`why`,});t("Watch the bots play: your turn comes next."); }
    }
   }
}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const CoachPanel__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type CoachPanel__SvelteComponent_ = ReturnType<typeof CoachPanel__SvelteComponent_>;
/*Ωignore_endΩ*/export default CoachPanel__SvelteComponent_;