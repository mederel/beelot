# Plan: a rate limiter that scales and fails open for new clients (US-175)

Each item leaves `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test --workspace` green. One pull
request, `perf:`.

1. **Spec and plan** (this file and the design).
2. **Benchmark before**: the ignored test `limiter_cost_under_concurrent_requests`, run on the old limiter.
3. **Tests first**: the 50,000-client cases in `window.rs` and `tests/limits.rs` (they fail on the old limiter: the newcomer is refused).
4. **The limiter**: `FixedWindowLimiter<K>` sharded, with eviction and `sweep`; `limit_key` returns an `IpAddr`; the passkey and
   security-events limiters take the new key types.
5. **The sweep job** in `jobs.rs`, every minute.
6. **Benchmark after**, the figures in the design, and the backlog's "Delivered" note.
