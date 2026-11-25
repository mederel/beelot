// The page's transitions, made to follow the effects level (US-207): `fly`, `scale` and `slide` of Svelte, except that below Full
// nothing travels. At Reduced a flying or growing element only fades in and out; a sliding one (it moves what is under it) is
// instant; at Off every one is instant. Components import these instead of "svelte/transition", so that a new transition cannot
// forget the setting (tests/source-rules.test.ts keeps it so). `fade` has no movement and is not wrapped.
import { fly as flyIn, scale as scaleIn, slide as slideIn, type FlyParams, type ScaleParams, type SlideParams } from "svelte/transition";
import { settings } from "$lib/stores/settings.svelte";

const full = () => settings.effects === "full";
const off = () => settings.effects === "off";

export function fly(node: Element, params: FlyParams = {}) {
  if (full()) return flyIn(node, params);
  return flyIn(node, { ...params, x: 0, y: 0, ...(off() ? { duration: 0, delay: 0 } : {}) });
}

export function scale(node: Element, params: ScaleParams = {}) {
  if (full()) return scaleIn(node, params);
  return scaleIn(node, { ...params, start: 1, ...(off() ? { duration: 0, delay: 0 } : {}) });
}

export function slide(node: Element, params: SlideParams = {}) {
  if (full()) return slideIn(node, params);
  return slideIn(node, { ...params, duration: 0, delay: 0 });
}
