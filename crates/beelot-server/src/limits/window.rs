//! A fixed-window counter per key, sharded so that requests of different clients rarely wait for one another.

use std::collections::HashMap;
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hash};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use time::OffsetDateTime;

use crate::clock::Clock;

/// The keys tracked at most, so the limiter cannot itself be used to exhaust memory.
pub const MAX_TRACKED: usize = 50_000;

/// The independent maps (each under its own lock) that the keys are spread over.
const SHARDS: usize = 16;

#[derive(Debug, Clone, Copy)]
struct Window {
    start: OffsetDateTime,
    count: u32,
}

type Shard<K> = Mutex<HashMap<K, Window>>;

/// Counts attempts per key within a window. When the map is full, the oldest windows are evicted to make room: a
/// flood of clients makes the limiter forget some counters, but never keeps a new client out (it fails open).
pub struct FixedWindowLimiter<K = ()> {
    limit: u32,
    window: Duration,
    /// How many keys a shard tracks at most.
    shard_capacity: usize,
    clock: Arc<dyn Clock>,
    hasher: RandomState,
    shards: Vec<Shard<K>>,
}

impl<K> std::fmt::Debug for FixedWindowLimiter<K> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FixedWindowLimiter")
            .field("limit", &self.limit)
            .field("window", &self.window)
            .finish_non_exhaustive()
    }
}

impl<K: Hash + Eq + Clone> FixedWindowLimiter<K> {
    pub fn new(limit: u32, window: Duration, max_tracked: usize, clock: Arc<dyn Clock>) -> Self {
        Self {
            limit,
            window,
            shard_capacity: max_tracked.div_ceil(SHARDS).max(1),
            clock,
            hasher: RandomState::new(),
            shards: (0..SHARDS).map(|_| Mutex::new(HashMap::new())).collect(),
        }
    }

    fn shard(&self, key: &K) -> &Shard<K> {
        &self.shards[self.hasher.hash_one(key) as usize % SHARDS]
    }

    fn expired(&self, window: &Window, now: OffsetDateTime) -> bool {
        now - window.start >= self.window
    }

    /// Makes room for one more key: the expired windows go first and, when the shard is still full, the oldest eighth.
    fn make_room(&self, windows: &mut HashMap<K, Window>, now: OffsetDateTime) {
        if windows.len() < self.shard_capacity {
            return;
        }
        windows.retain(|_, window| !self.expired(window, now));
        if windows.len() < self.shard_capacity {
            return;
        }
        let mut by_age: Vec<(OffsetDateTime, K)> = windows
            .iter()
            .map(|(key, window)| (window.start, key.clone()))
            .collect();
        by_age.sort_unstable_by_key(|(start, _)| *start);
        for (_, key) in by_age.into_iter().take((self.shard_capacity / 8).max(1)) {
            windows.remove(&key);
        }
    }

    /// Removes the expired windows. The server runs it on a timer, so idle keys do not stay in memory.
    pub fn sweep(&self) {
        let now = self.clock.now();
        for shard in &self.shards {
            shard
                .lock()
                .unwrap()
                .retain(|_, window| !self.expired(window, now));
        }
    }

    /// The number of keys tracked now.
    pub fn tracked(&self) -> usize {
        self.shards
            .iter()
            .map(|shard| shard.lock().unwrap().len())
            .sum()
    }

    /// Counts this attempt, refused or not. `Err` holds the seconds to wait before the window ends.
    pub fn consume(&self, key: &K) -> Result<(), u64> {
        let now = self.clock.now();
        let mut windows = self.shard(key).lock().unwrap();
        if !windows.contains_key(key) {
            self.make_room(&mut windows, now);
        }
        let window = windows
            .entry(key.clone())
            .and_modify(|current| {
                if self.expired(current, now) {
                    *current = Window {
                        start: now,
                        count: 1,
                    };
                } else {
                    current.count += 1;
                }
            })
            .or_insert(Window {
                start: now,
                count: 1,
            });
        if window.count <= self.limit {
            return Ok(());
        }
        let left_ms = (window.start + self.window - now).whole_milliseconds();
        Err(((left_ms + 999) / 1000).max(1) as u64)
    }

    /// Whether the key has used up its window, without counting anything.
    pub fn is_full(&self, key: &K) -> bool {
        let now = self.clock.now();
        let windows = self.shard(key).lock().unwrap();
        windows
            .get(key)
            .is_some_and(|window| !self.expired(window, now) && window.count >= self.limit)
    }

    /// Whether the key is within its limit now; when it is, this attempt is counted. A refusal isn't counted.
    pub fn try_acquire(&self, key: &K) -> bool {
        let now = self.clock.now();
        let mut windows = self.shard(key).lock().unwrap();
        match windows.get_mut(key) {
            Some(window) if !self.expired(window, now) => {
                if window.count >= self.limit {
                    return false;
                }
                window.count += 1;
                true
            }
            current => {
                if self.limit == 0 {
                    return false;
                }
                if current.is_none() {
                    self.make_room(&mut windows, now);
                }
                windows.insert(
                    key.clone(),
                    Window {
                        start: now,
                        count: 1,
                    },
                );
                true
            }
        }
    }
}

#[cfg(test)]
mod tests {
    //! The limiter cases of the passkey rate limit.

    use std::net::{IpAddr, Ipv4Addr};

    use time::macros::datetime;

    use super::*;
    use crate::clock::FakeClock;

    const HOUR: Duration = Duration::from_secs(3600);

    fn limiter(limit: u32) -> (FixedWindowLimiter<IpAddr>, Arc<FakeClock>) {
        let clock = Arc::new(FakeClock::new(datetime!(2026-01-01 0:00 UTC)));
        (
            FixedWindowLimiter::new(limit, HOUR, MAX_TRACKED, clock.clone()),
            clock,
        )
    }

    fn ip(text: &str) -> IpAddr {
        text.parse().unwrap()
    }

    fn client(n: u32) -> IpAddr {
        IpAddr::V4(Ipv4Addr::from(n))
    }

    #[test]
    fn allows_up_to_the_limit_per_ip() {
        let (limiter, _) = limiter(30);
        for _ in 0..30 {
            assert!(limiter.try_acquire(&ip("10.0.0.1")));
        }
        assert!(!limiter.try_acquire(&ip("10.0.0.1")));
    }

    #[test]
    fn another_ip_is_not_affected() {
        let (limiter, _) = limiter(30);
        for _ in 0..31 {
            limiter.try_acquire(&ip("10.0.0.1"));
        }
        assert!(limiter.try_acquire(&ip("10.0.0.2")));
    }

    #[test]
    fn window_resets_after_an_hour() {
        let (limiter, clock) = limiter(30);
        for _ in 0..30 {
            limiter.try_acquire(&ip("10.0.0.1"));
        }
        assert!(!limiter.try_acquire(&ip("10.0.0.1")));
        clock.advance(time::Duration::hours(1));
        assert!(limiter.try_acquire(&ip("10.0.0.1")));
    }

    #[test]
    fn refused_requests_do_not_count() {
        let (limiter, clock) = limiter(30);
        for _ in 0..30 {
            limiter.try_acquire(&ip("10.0.0.1"));
        }
        for _ in 0..20 {
            assert!(!limiter.try_acquire(&ip("10.0.0.1")));
        }
        clock.advance(time::Duration::hours(1));
        for _ in 0..30 {
            assert!(limiter.try_acquire(&ip("10.0.0.1")));
        }
        assert!(!limiter.try_acquire(&ip("10.0.0.1")));
    }

    #[test]
    fn a_full_map_evicts_its_oldest_clients_instead_of_refusing_a_new_one() {
        let (generous, clock) = limiter(3);
        for i in 0..50_000 {
            assert!(generous.try_acquire(&client(i)));
            clock.advance(time::Duration::milliseconds(1));
        }
        assert!(generous.try_acquire(&ip("192.168.0.1")));
        assert!(generous.tracked() <= MAX_TRACKED + SHARDS);
        // The newcomer is held to its own limit, and the freshest clients keep theirs.
        for _ in 0..2 {
            assert!(generous.try_acquire(&ip("192.168.0.1")));
        }
        assert!(!generous.try_acquire(&ip("192.168.0.1")));
        for _ in 0..2 {
            assert!(generous.try_acquire(&client(49_999)));
        }
        assert!(!generous.try_acquire(&client(49_999)));
    }

    #[test]
    fn consume_serves_a_new_client_when_the_map_is_full() {
        let (generous, _) = limiter(3);
        for i in 0..60_000 {
            let _ = generous.consume(&client(i));
        }
        assert!(generous.tracked() <= MAX_TRACKED + SHARDS);
        assert_eq!(generous.consume(&ip("192.168.0.1")), Ok(()));
    }

    #[test]
    fn the_sweep_removes_expired_windows_only() {
        let (limiter, clock) = limiter(3);
        for i in 0..100 {
            limiter.try_acquire(&client(i));
        }
        clock.advance(time::Duration::minutes(30));
        limiter.try_acquire(&ip("172.16.0.1"));
        clock.advance(time::Duration::minutes(31));
        limiter.sweep();
        assert_eq!(limiter.tracked(), 1);
    }

    #[test]
    fn consume_counts_refusals_and_says_how_long_to_wait() {
        let clock = Arc::new(FakeClock::new(datetime!(2026-01-01 0:00 UTC)));
        let limiter =
            FixedWindowLimiter::new(1, Duration::from_secs(60), MAX_TRACKED, clock.clone());
        assert_eq!(limiter.consume(&"a"), Ok(()));
        clock.advance(time::Duration::milliseconds(10_500));
        assert_eq!(limiter.consume(&"a"), Err(50));
        clock.advance(time::Duration::seconds(49));
        assert_eq!(limiter.consume(&"a"), Err(1));
        clock.advance(time::Duration::seconds(1));
        assert_eq!(limiter.consume(&"a"), Ok(()));
    }

    /// Run with `cargo test -p beelot-server --release --lib -- --ignored --nocapture limiter_cost`: the cost of
    /// `consume` under concurrent requests (8 threads, 2,000 distinct clients each, 1,000,000 calls in all).
    #[test]
    #[ignore = "a benchmark, not a check"]
    fn limiter_cost_under_concurrent_requests() {
        let clock = Arc::new(FakeClock::new(datetime!(2026-01-01 0:00 UTC)));
        let limiter = Arc::new(FixedWindowLimiter::new(u32::MAX, HOUR, MAX_TRACKED, clock));
        let started = std::time::Instant::now();
        let threads: Vec<_> = (0..8u32)
            .map(|thread| {
                let limiter = limiter.clone();
                std::thread::spawn(move || {
                    for call in 0..125_000u32 {
                        let _ = limiter.consume(&client(thread * 2_000 + call % 2_000));
                    }
                })
            })
            .collect();
        for thread in threads {
            thread.join().unwrap();
        }
        println!(
            "1,000,000 consume calls on 8 threads: {:?}",
            started.elapsed()
        );
    }
}
