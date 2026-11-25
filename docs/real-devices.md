# Real devices before a release (US-209)

Emulation (the browser checks of US-201 to US-208) does not show real touch, the device's own fonts, the browser's bars that
come and go, the on-screen keyboard or a slow GPU. Before a release, a person tries Beelot on the five devices below, about
fifteen minutes each, and the `real-devices` workflow runs the layout checks on three real phones of BrowserStack. The record
of both goes on the release candidate's pull request or on the release, so that a regression has a date.

## The devices

| Device | Why |
| --- | --- |
| An iPhone with a notch or a Dynamic Island (Safari) | The safe areas, Safari's bars that shrink and grow, the iOS keyboard. |
| A small or old iPhone (an iPhone SE, 375×667) | The smallest common screen, an older Safari, a slower GPU. |
| A recent Android phone (Chrome and the Android app) | The Android app (`pages/docs/android.html`, installed from the Play internal testing track) full screen, and Chrome beside it. |
| A low-end Android phone (2 to 3 GB of memory) | A slow CPU and GPU: the animations, the start, the fonts at a large system size. |
| A tablet (an iPad or an Android tablet) | The wide layouts, landscape, a pointer and a keyboard if one is attached. |

## The steps on each device (about fifteen minutes)

1. **Install.** On Android, install the release candidate's Android app; on iOS, open the page in Safari and add it to the
   home screen. Open it from its icon.
2. **A solo round, both orientations.** Start a solo table and play a round to the end, turning the device to landscape in
   the middle of it and back to portrait for the result.
3. **The keyboard.** Open the sign-in panel on the Me tab and tap the field: the keyboard must not hide the field or its
   button, and closing it must give the page back as it was.
4. **The language.** Switch to French, then to Dutch, then back: no text cut, no button that grows out of its row.
5. **A private table from a second device.** Make a private table, join it from another device with its code or link, and
   play a trick between the two.
6. **The network (US-141).** In the middle of a round, turn on airplane mode for twenty seconds, then off: the page says the
   connection is lost, then picks the table up where it was.

### What to look for

- a control clipped by the edge, the notch, the browser's bar or the keyboard;
- a jump: something that moves under the finger while a card is played or a panel opens;
- an animation that stutters, or a screen that takes more than a few seconds to appear;
- a text too small to read, cut, or written over another;
- a tap that does nothing, or does the thing next to it.

## The automated run

`.github/workflows/real-devices.yml` runs `pages.spec.ts` and `key-screens.spec.ts` (the layout checks of US-201) on the
devices of `real-devices/lib.mjs`. Start it either way:

- add the label `release-candidate` to the pull request: the record becomes a comment on it;
- or Actions, `real-devices`, Run workflow, on the candidate's ref, with a pull request number or a release tag (such as
  `v9.1.0`) whose notes get the record.

Without the secrets `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` the run does nothing and succeeds; the setup is in
`pages/docs/release.html`.

## The record

The workflow writes the devices, the date, the version, the commit and the result of the automated run. Add the people's
part under it, in a comment on the same pull request or in the release notes:

```markdown
Found on the checklist (2026-11-25, v9.1.0 candidate, by …):
- iPhone 15, iOS 17, Safari: nothing
- iPhone SE (2nd generation), iOS 16, Safari: the Pass button touches the home indicator in landscape (#…)
- Pixel 8, Android 15, Chrome and the app: nothing
- Galaxy A14, Android 14, Chrome: the deal animation stutters (#…)
- iPad (9th generation), iPadOS 17, Safari: nothing
```

Open an issue for each fault found (a layout bug follows the bug-fix rules of AGENTS.md) and link it in the record.
