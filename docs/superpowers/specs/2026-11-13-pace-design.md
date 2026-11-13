# Choose how fast the bots play (US-147)

## Design

- `pace.js` (pure) holds one table of base delays (bot think, call reveal, own call, trick reveal, trick hold, trick
  collect, deal flight, deal gap) and three paces: relaxed x1.5, normal x1, quick x0.5. `paceDelay(name, pace)` is the only
  way to get a delay; an unknown pace is normal, an unknown name an error.
- `app-core.js` reads the pace from `<body data-pace>` through `paced(name)`; the eight former constants are gone and every
  use calls it. Settings has a Pace choice, stored under `beelot.pace` (session-only when storage is blocked), like Effects.
- Quick shortens each pause, never removes one: calls and cards still appear one after the other, and the status text is
  unchanged. Reduced motion is the Effects setting and keeps its own rule; the pace does not touch it.
- Online tables: the server's timings are unchanged; the pace only scales how long the client shows what it received.
- CSS animation durations (a card's fly-in, for example) are fixed; the pace scales the delays between them.

## Not verified

No browser check of how Quick or Relaxed feel; the delay table and the wiring are tested.
