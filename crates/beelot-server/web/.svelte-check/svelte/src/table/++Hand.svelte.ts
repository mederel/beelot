///<reference types="svelte" />
;// The player's hand: an arc that always fits its cards. On the player's turn the legal cards rise; a tap, Enter or Space,
// or a swipe up plays one. A card that cannot be played shakes and the status line says why (US-108). A hinted card
// glows (US-065). During a deal the cards turn face up as their packets land, then slide into order (US-140).

import { t, cardName } from "$lib/i18n/i18n.svelte";
import { settings } from "$lib/stores/settings.svelte";
import PlayingCard from "$lib/cards/PlayingCard.svelte";
import CardBack from "$lib/cards/CardBack.svelte";
import type { HandCard, TableGame } from "./game.svelte";

;type $$ComponentProps =  { game: TableGame };function $$render() {

  
  
  
  
  
  
  
  

  let { game }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();
  let width = $state(360);
  let shaking = $state<string | null>(null);
  const buttons: HTMLElement[] = [];

  const count = $derived(game.hand.length);
  // The card's width in pixels follows the CSS variable; the spread fits the width, up to 80 % of a card apart.
  let cardWidth = $state(70);
  const step = $derived(count > 1 ? Math.min(4, 20 / (count - 1)) : 0);
  // A rotated card swings its top corner outwards (it turns around a point below it): keep that inside the hand.
  const swing = $derived(cardWidth * 1.4 * 1.2 * Math.sin((((count - 1) / 2) * step * Math.PI) / 180));
  const spacing = $derived(count > 1 ? Math.min(cardWidth * 0.8, (width - cardWidth - 2 * swing - 6) / (count - 1)) : 0);

  function pose(index: number) {
    const from = index - (count - 1) / 2;
    return { x: from * spacing, rotate: from * step, drop: Math.abs(from) ** 1.6 * (cardWidth * 0.03) };
  }

  let probe: HTMLElement;
  $effect(() => {
    void width;
    if (probe) cardWidth = probe.getBoundingClientRect().width || cardWidth;
  });

  function refuse(item: HandCard) {
    shaking = null;
    requestAnimationFrame(() => (shaking = item.key));
    window.setTimeout(() => shaking === item.key && (shaking = null), 450);
    game.refuse(item.key);
  }

  function activate(item: HandCard, node: Element) {
    if (!game.handLive) return;
    if (!game.legal.includes(item.key)) refuse(item);
    else if (game.coachBlocks(item.key)) {
      // A tutorial's coach explains why this card is not the one to play (US-199).
      shaking = null;
      requestAnimationFrame(() => (shaking = item.key));
      window.setTimeout(() => shaking === item.key && (shaking = null), 450);
      game.coachTap(item.key);
    } else game.play(item, node);
  }

  // A swipe up from a legal card plays it; the card follows the finger until then.
  let drag: { key: string; startY: number; startX: number; dy: number; node: HTMLElement } | null = null;
  let swallowClick = false;
  function down(event: PointerEvent, item: HandCard) {
    if (!game.handLive || !game.legal.includes(item.key) || event.pointerType === "mouse") return;
    drag = { key: item.key, startY: event.clientY, startX: event.clientX, dy: 0, node: event.currentTarget as HTMLElement };
  }
  function move(event: PointerEvent) {
    if (!drag) return;
    drag.dy = Math.min(0, event.clientY - drag.startY);
    if (Math.abs(drag.dy) > 6) drag.node.style.setProperty("--drag", `${drag.dy}px`);
  }
  function up(item: HandCard) {
    if (!drag || drag.key !== item.key) return;
    const { dy, node } = drag;
    drag = null;
    node.style.removeProperty("--drag");
    if (dy < -50) {
      swallowClick = true;
      activate(item, node);
    }
  }
  function click(item: HandCard, event: MouseEvent) {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    activate(item, event.currentTarget as Element);
  }

  function keydown(event: KeyboardEvent, index: number) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = (index + (event.key === "ArrowRight" ? 1 : -1) + count) % count;
      buttons[next]?.focus();
    }
  }
;
async () => {

 { const $$_div0 = svelteHTML.createElement("div", {         "class":`hand`,"aria-label":t(count === 5 ? "Your five cards" : "Your eight cards"),"role":`group`,});game.handLive;game.dealing;width= $$_div0.clientWidth;game.anchors.hand = $$_div0;
   { const $$_span1 = svelteHTML.createElement("span", {    "class":`probe`,"aria-hidden":`true`,});probe = $$_span1; }
      for(let item of __sveltets_2_ensureArray(game.hand)){let index = 1;item.key;
    const p = pose(index);
    const legal = game.legal.includes(item.key);
    const illegal = Boolean(game.illegal[item.key]);
     { const $$_button1 = svelteHTML.createElement("button", {                                  "type":`button`,"class":`hand-card`,"aria-label":game.handLive && legal ? t("Play {0}", cardName(item.card)) : cardName(item.card),"aria-disabled":!game.handLive || !legal ? "true" : undefined,"tabindex":game.handLive && (legal || illegal) ? 0 : -1,"onclick":(event) => click(item, event),"onpointerdown":(event) => down(event, item),"onpointermove":move,"onpointerup":() => up(item),"onpointercancel":() => up(item),"onkeydown":(event) => keydown(event, index),});buttons[index] = $$_button1;game.handLive && legal;game.handLive && illegal;game.hintCard === item.key;!item.dealt;game.playing === item.key;shaking === item.key;__sveltets_2_ensureType(String, Number, `${p.x} `);__sveltets_2_ensureType(String, Number, `${p.rotate} `);__sveltets_2_ensureType(String, Number, `${p.drop} `);__sveltets_2_ensureType(String, Number, index);
       { svelteHTML.createElement("span", { "class":`flip`,});
         { svelteHTML.createElement("span", { "class":`side face`,}); { const $$_draCgniyalP4C = __sveltets_2_ensureComponent(PlayingCard); new $$_draCgniyalP4C({ target: __sveltets_2_any(), props: {    "card":item.card,"label":false,}});} }
         { svelteHTML.createElement("span", { "class":`side back`,}); { const $$_kcaBdraC4C = __sveltets_2_ensureComponent(CardBack); new $$_kcaBdraC4C({ target: __sveltets_2_any(), props: {}});} }
       }
     }
  }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Hand__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Hand__SvelteComponent_ = ReturnType<typeof Hand__SvelteComponent_>;
/*Ωignore_endΩ*/export default Hand__SvelteComponent_;