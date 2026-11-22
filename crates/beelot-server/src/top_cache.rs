//! A short-lived cache for what many players ask at once and that changes slowly, such as the top of a leaderboard (US-182).
//!
//! The first request loads the value; the others wait for that one load. Once the value is older than the lifetime, a request
//! gets the old value at once and one background task loads the new one, so the database is read once per lifetime however
//! many players ask, and no player waits for a refresh.

use std::collections::HashMap;
use std::fmt::Display;
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use tokio::time::Instant;

struct Slot<V> {
    cached: Mutex<Option<(Instant, Arc<V>)>>,
    /// A background refresh is running.
    refreshing: AtomicBool,
    /// Held by the load of an empty slot, so that concurrent first requests share it.
    loading: tokio::sync::Mutex<()>,
}

impl<V> Slot<V> {
    fn cached(&self) -> Option<(Instant, Arc<V>)> {
        self.cached
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn store(&self, value: Arc<V>) {
        *self.cached.lock().unwrap_or_else(PoisonError::into_inner) = Some((Instant::now(), value));
    }
}

pub struct TopCache<V> {
    lifetime: Duration,
    slots: Mutex<HashMap<&'static str, Arc<Slot<V>>>>,
}

impl<V: Send + Sync + 'static> TopCache<V> {
    pub fn new(lifetime: Duration) -> Self {
        Self {
            lifetime,
            slots: Mutex::new(HashMap::new()),
        }
    }

    fn slot(&self, key: &'static str) -> Arc<Slot<V>> {
        self.slots
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .entry(key)
            .or_insert_with(|| {
                Arc::new(Slot {
                    cached: Mutex::new(None),
                    refreshing: AtomicBool::new(false),
                    loading: tokio::sync::Mutex::new(()),
                })
            })
            .clone()
    }

    /// The value under `key`, loaded by `load` when there is none; an old one is returned while a background task renews it.
    pub async fn get<F, Fut, E>(self: &Arc<Self>, key: &'static str, load: F) -> Result<Arc<V>, E>
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<V, E>> + Send + 'static,
        E: Display + Send + 'static,
    {
        let slot = self.slot(key);
        if let Some((loaded_at, value)) = slot.cached() {
            if loaded_at.elapsed() >= self.lifetime && !slot.refreshing.swap(true, Ordering::AcqRel)
            {
                let slot = slot.clone();
                tokio::spawn(async move {
                    match load().await {
                        Ok(fresh) => slot.store(Arc::new(fresh)),
                        Err(error) => {
                            tracing::warn!(%error, "a cached value could not be renewed, the old one is kept");
                        }
                    }
                    slot.refreshing.store(false, Ordering::Release);
                });
            }
            return Ok(value);
        }
        let _first = slot.loading.lock().await;
        if let Some((_, value)) = slot.cached() {
            return Ok(value);
        }
        let value = Arc::new(load().await?);
        slot.store(value.clone());
        Ok(value)
    }

    /// Forgets what is kept under `key`: the next request loads it again.
    pub fn invalidate(&self, key: &'static str) {
        let slot = self.slot(key);
        *slot.cached.lock().unwrap_or_else(PoisonError::into_inner) = None;
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicUsize;

    use super::*;

    fn counting() -> (
        Arc<AtomicUsize>,
        impl Fn() -> std::future::Ready<Result<usize, String>> + Send + Sync + 'static + Clone,
    ) {
        let loads = Arc::new(AtomicUsize::new(0));
        let counter = loads.clone();
        (loads, move || {
            std::future::ready(Ok(counter.fetch_add(1, Ordering::SeqCst) + 1))
        })
    }

    #[tokio::test(start_paused = true)]
    async fn many_requests_read_the_source_once_in_a_lifetime() {
        let cache = Arc::new(TopCache::new(Duration::from_secs(60)));
        let (loads, load) = counting();
        let mut requests = Vec::new();
        for _ in 0..100 {
            let (cache, load) = (cache.clone(), load.clone());
            requests.push(tokio::spawn(async move { cache.get("A", load).await }));
        }
        for request in requests {
            assert_eq!(*request.await.unwrap().unwrap(), 1);
        }
        tokio::time::advance(Duration::from_secs(59)).await;
        assert_eq!(*cache.get("A", load.clone()).await.unwrap(), 1);
        assert_eq!(loads.load(Ordering::SeqCst), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn an_old_value_is_served_while_one_task_renews_it() {
        let cache = Arc::new(TopCache::new(Duration::from_secs(60)));
        let (loads, load) = counting();
        assert_eq!(*cache.get("A", load.clone()).await.unwrap(), 1);
        tokio::time::advance(Duration::from_secs(61)).await;
        for _ in 0..10 {
            assert_eq!(*cache.get("A", load.clone()).await.unwrap(), 1);
        }
        for _ in 0..5 {
            tokio::task::yield_now().await;
        }
        assert_eq!(loads.load(Ordering::SeqCst), 2, "one renewal, not ten");
        assert_eq!(*cache.get("A", load.clone()).await.unwrap(), 2);
    }

    #[tokio::test(start_paused = true)]
    async fn keys_are_kept_apart_and_an_invalidated_one_is_loaded_again() {
        let cache = Arc::new(TopCache::new(Duration::from_secs(60)));
        let (loads, load) = counting();
        assert_eq!(*cache.get("A", load.clone()).await.unwrap(), 1);
        assert_eq!(*cache.get("B", load.clone()).await.unwrap(), 2);
        cache.invalidate("A");
        assert_eq!(*cache.get("A", load.clone()).await.unwrap(), 3);
        assert_eq!(*cache.get("B", load.clone()).await.unwrap(), 2);
        assert_eq!(loads.load(Ordering::SeqCst), 3);
    }

    #[tokio::test(start_paused = true)]
    async fn a_failed_first_load_is_not_kept() {
        let cache = Arc::new(TopCache::<usize>::new(Duration::from_secs(60)));
        let failed: Result<_, String> = cache
            .get("A", || std::future::ready(Err("down".to_string())))
            .await;
        assert!(failed.is_err());
        let (_, load) = counting();
        assert_eq!(*cache.get("A", load).await.unwrap(), 1);
    }
}
