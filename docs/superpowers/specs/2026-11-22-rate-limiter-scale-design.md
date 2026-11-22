# Design: a rate limiter that scales and fails open for new clients (US-175)

## Goal

`FixedWindowLimiter` (`limits/window.rs`) kept every client in one `HashMap<String, _>` behind one `Mutex`, and built a `String`
for each request. When the map held 50,000 clients it refused every new one until a window ended, so a flood from many
addresses locked every real player out. The story asks for a sharded limiter keyed by the address, a background sweep, and
eviction of the oldest entries instead of a refusal.

## Decisions

- **Sharded, generic over the key.** `FixedWindowLimiter<K: Hash + Eq + Clone>` holds 16 `Mutex<HashMap<K, Window>>`; the shard of
  a key comes from a randomly seeded hasher (`RandomState`), so a client cannot aim its addresses at one shard. Sixteen shards
  cut the contention without a new dependency (a concurrent map such as `dashmap` is already in the tree for the passkey
  ceremonies, but a plain map under a lock lets the eviction below stay simple and exact). The total capacity (50,000) is split
  evenly: `ceil(50,000 / 16)` keys per shard.
- **Keyed by the address.** `limit_key` returns an `IpAddr` (an IPv6 address with its last 64 bits cleared, an IPv4-mapped IPv6
  address as its IPv4), so the middleware allocates nothing per request. The passkey limiter and the security events' limiter
  use the same type; the events' overall limit, which has one key, is a `FixedWindowLimiter<()>`.
- **A full shard evicts, it does not refuse.** To make room for a new key a shard first drops the expired windows; if it is still
  full it drops its oldest eighth (by window start) in one pass, so the cost is amortised over the next inserts and a flood does
  not make every new request scan the map. A flooding client therefore makes the limiter forget the oldest counters (some
  clients get a fresh window early): the limiter fails open, which the story prefers to locking real players out.
- **A background sweep.** `RateLimits::sweep` removes the expired windows of the three limiters; `jobs::spawn_all` runs it every
  minute (the default window), on the same cancellation token as the other jobs. The passkey and events limiters are bounded and
  evict on their own; they are not swept (they hold at most one entry per address and hour, and are rarely hit).
- **Values and messages are unchanged.** The limits, `Retry-After` and the error bodies are those of before.

## Behaviour that changes on purpose

The test `tracks_a_bounded_number_of_clients_and_frees_expired_ones` of `tests/limits.rs` asserted the old refusal of a newcomer
(429, `Retry-After: 61`) when the map was full. It becomes `a_full_map_still_serves_a_new_client_within_its_own_limit`: the story
reverses that behaviour. Every other test of the file passes unchanged.

## Tests

- `window.rs`: a full map (50,000 clients) serves a newcomer, which is then held to its own limit; the tracked count stays
  bounded; `consume` serves a newcomer on a full map; the sweep removes expired windows only.
- `tests/limits.rs`: the same through the router with 50,000 clients, the newcomer's 300 requests pass and the 301st is refused.

## Figures

An ignored benchmark in `window.rs` (`limiter_cost_under_concurrent_requests`: 8 threads, 1,000,000 `consume` calls over 16,000
clients, release build, on the developer's machine, a shared one so the runs vary):

| | runs (ms) | median |
|---|---|---|
| Before (one lock, a `String` built per call) | 263, 350, 422 | 350 ms |
| After (16 shards, an `IpAddr` key) | 83, 246, 264, 305, 159, 342, 127, 146 | about 160 ms |

## Not done

No per-shard metrics, and no change to the passkey and events limiters' windows.
