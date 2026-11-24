// The sizes the browser tests run on (US-202): one list, one line a device. playwright.config.ts builds a project from each
// entry, and matrix.spec.ts checks that the list and the projects agree. Adding a device is adding a line here.
import { devices as descriptors } from "@playwright/test";

export interface Device {
  /** The project's name: the size and a word for what it is. */
  name: string;
  width: number;
  height: number;
  /** Why this size is on the list: what it stands for, so that nobody removes it, or adds a twin, without knowing. */
  reason: string;
  /**
   * Playwright's descriptor of the device (user agent, touch, pixel ratio, `isMobile`). Without one the device is a desktop,
   * or has the explicit `profile` that Playwright does not know.
   */
  descriptor?: string;
  /** A profile Playwright has no descriptor for: an Android phone, as Chrome on it says. */
  profile?: { userAgent: string; deviceScaleFactor: number };
  /** Plays the long solo round (solo-round.spec.ts), which takes minutes: a few sizes only, so that CI stays under its limit. */
  longRound?: true;
}

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

export const DEVICES: Device[] = [
  {
    name: "narrow-320",
    width: 320,
    height: 568,
    descriptor: "iPhone SE",
    reason: "the smallest iPhone still sold, and the narrowest screen the page promises to fit",
    longRound: true
  },
  { name: "android-360", width: 360, height: 640, profile: { userAgent: ANDROID, deviceScaleFactor: 3 }, reason: "the common small Android (Galaxy S and A series)" },
  { name: "phone-375", width: 375, height: 667, descriptor: "iPhone 8", reason: "the iPhone SE (2nd and 3rd generation) and the long-standing 375 px design width" },
  { name: "iphone-390", width: 390, height: 844, descriptor: "iPhone 14", reason: "the most common iPhone width (12 to 16)" },
  { name: "android-portrait", width: 412, height: 915, profile: { userAgent: ANDROID, deviceScaleFactor: 2.625 }, reason: "the Pixel and most large Androids" },
  { name: "iphone-430", width: 430, height: 932, descriptor: "iPhone 14 Pro Max", reason: "the widest iPhone (Plus and Pro Max)" },
  { name: "tablet-768", width: 768, height: 1024, descriptor: "iPad Mini", reason: "a tablet in portrait: the width of the first breakpoint above the phones", longRound: true },
  {
    name: "phone-landscape-667",
    width: 667,
    height: 375,
    descriptor: "iPhone SE landscape",
    reason: "a small phone on its side: one of the two shortest screens",
    longRound: true
  },
  { name: "phone-landscape-844", width: 844, height: 390, descriptor: "iPhone 14 landscape", reason: "a current iPhone on its side: the other shortest screen" },
  { name: "android-landscape", width: 915, height: 412, profile: { userAgent: ANDROID, deviceScaleFactor: 2.625 }, reason: "a large Android on its side" },
  { name: "tablet-landscape-1024", width: 1024, height: 768, descriptor: "iPad Mini landscape", reason: "a tablet on its side, and the smallest laptop window" },
  { name: "desktop", width: 1280, height: 800, reason: "a laptop screen, the desktop size of the tests so far", longRound: true },
  { name: "desktop-1920", width: 1920, height: 1080, reason: "a full-HD monitor, the most common desktop" },
  { name: "desktop-2560", width: 2560, height: 1440, reason: "a large monitor, where a layout that stretches shows" }
];

/** The Playwright `use` of a device: its descriptor when Playwright knows it, with the size of the screen without the browser's bars. */
export function useOf(device: Device) {
  const size = { width: device.width, height: device.height };
  if (device.descriptor) {
    const known = descriptors[device.descriptor];
    if (!known) throw new Error(`Playwright has no device descriptor "${device.descriptor}" (${device.name})`);
    // The tests run in Chromium: the descriptor gives the profile of the device, not its engine (US-203 adds the engines).
    const { defaultBrowserType: _engine, ...profile } = known;
    return { ...profile, viewport: size, screen: size };
  }
  if (device.profile) return { ...device.profile, viewport: size, screen: size, hasTouch: true, isMobile: true };
  return { viewport: size };
}
