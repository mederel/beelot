//! Bounds on what clients may send: requests and creations per client address, and body sizes.

pub mod rate;
pub mod size;
pub mod solver;
pub mod window;

pub use rate::{ClientIp, RateLimits, client_ip, limit_key};
pub use solver::SolverGate;
pub use window::FixedWindowLimiter;
