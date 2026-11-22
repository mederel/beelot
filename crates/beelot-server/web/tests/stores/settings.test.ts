// The settings store: what the player chose is read from the same `beelot.*` keys as before the redesign, written back
// when it changes, mirrored on <html> for the stylesheet, and a blocked storage never breaks a choice.
import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

async function load(stored: Record<string, string> = {}) {
  localStorage.clear();
  for (const [key, value] of Object.entries(stored)) localStorage.setItem(key, value);
  vi.resetModules();
  return import("$lib/stores/settings.svelte");
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.effects;
  delete document.documentElement.dataset.pace;
  delete document.documentElement.dataset.theme;
});

test("nothing stored gives the defaults: full effects, normal pace, the Hive theme, everything on", async () => {
  const { settings } = await load();
  assert.equal(settings.effects, "full");
  assert.equal(settings.pace, "normal");
  assert.equal(settings.theme, "comic");
  assert.deepEqual(settings.unlocked, []);
  assert.equal(settings.sound, true);
  assert.equal(settings.reactions, true);
  assert.equal(settings.botComments, true);
  assert.equal(settings.vibration, true);
});

test("stored choices are read, and the older reduce-motion setting becomes the reduced level", async () => {
  const stored = await load({ "beelot.effects": "off", "beelot.pace": "quick", "beelot.sound-enabled": "false", "beelot.bot-comments": "false" });
  assert.equal(stored.settings.effects, "off");
  assert.equal(stored.settings.pace, "quick");
  assert.equal(stored.settings.sound, false);
  assert.equal(stored.settings.botComments, false);
  const legacy = await load({ "beelot.reduced-motion": "true" });
  assert.equal(legacy.settings.effects, "reduced");
});

test("a locked theme is only used once it is unlocked", async () => {
  assert.equal((await load({ "beelot.theme": "ruby" })).settings.theme, "comic");
  assert.equal((await load({ "beelot.theme": "ruby", "beelot.unlocked-themes": '["ruby"]' })).settings.theme, "ruby");
});

test("applySettings mirrors the look on the root element", async () => {
  const { applySettings } = await load({ "beelot.effects": "reduced", "beelot.pace": "relaxed", "beelot.theme": "midnight" });
  applySettings();
  assert.equal(document.documentElement.dataset.effects, "reduced");
  assert.equal(document.documentElement.dataset.pace, "relaxed");
  assert.equal(document.documentElement.dataset.theme, "midnight");
});

test("each setter updates the store, the storage and the root element", async () => {
  const s = await load({ "beelot.reduced-motion": "true" });
  s.setEffects("off");
  assert.equal(s.settings.effects, "off");
  assert.equal(localStorage.getItem("beelot.effects"), "off");
  assert.equal(localStorage.getItem("beelot.reduced-motion"), null, "the older key is dropped");
  assert.equal(document.documentElement.dataset.effects, "off");
  s.setPace("quick");
  assert.equal(localStorage.getItem("beelot.pace"), "quick");
  assert.equal(document.documentElement.dataset.pace, "quick");
  s.setTheme("sunset");
  assert.equal(localStorage.getItem("beelot.theme"), "sunset");
  assert.equal(document.documentElement.dataset.theme, "sunset");
  s.setMusic(true);
  assert.equal(localStorage.getItem("beelot.music-enabled"), "true");
  s.setMusicVolume("high");
  assert.equal(localStorage.getItem("beelot.music-volume"), "high");
  s.setReactions(false);
  assert.equal(localStorage.getItem("beelot.reactions-enabled"), "false");
  s.setBotComments(false);
  assert.equal(localStorage.getItem("beelot.bot-comments"), "false");
  s.setSound(false);
  assert.equal(s.settings.sound, false);
  assert.equal(localStorage.getItem("beelot.sound-enabled"), "false");
  s.setVibrationSetting(false);
  assert.equal(localStorage.getItem("beelot.vibration"), "false");
});

test("choosing a locked theme falls back to Hive; unlocking makes it available and keeps a stored choice", async () => {
  const s = await load();
  s.setTheme("gilded");
  assert.equal(s.settings.theme, "comic");
  localStorage.setItem("beelot.theme", "gilded");
  s.setUnlocked(["gilded"]);
  assert.equal(s.settings.theme, "gilded");
  assert.deepEqual(JSON.parse(localStorage.getItem("beelot.unlocked-themes")!), ["gilded"]);
  assert.equal(document.documentElement.dataset.theme, "gilded");
});

test("paced scales a pause by the chosen pace, and the motion helpers follow the effects level", async () => {
  const s = await load();
  assert.equal(s.paced("trickHold"), 1800);
  assert.equal(s.motionFull(), true);
  assert.equal(s.motionReduced(), false);
  s.setPace("quick");
  assert.equal(s.paced("trickHold"), 900);
  s.setEffects("reduced");
  assert.equal(s.motionFull(), false);
  assert.equal(s.motionReduced(), true);
});

test("a storage that refuses writes keeps the choice for the page", async () => {
  const s = await load();
  const real = localStorage;
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => real.getItem(key),
    removeItem: (key: string) => real.removeItem(key),
    setItem: () => {
      throw new DOMException("blocked", "SecurityError");
    }
  });
  s.setPace("relaxed");
  s.setReactions(false);
  assert.equal(s.settings.pace, "relaxed");
  assert.equal(s.settings.reactions, false);
});
