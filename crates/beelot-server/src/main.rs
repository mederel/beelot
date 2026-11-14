use std::sync::Arc;

use anyhow::Context;
use beelot_server::app::{AppState, router};
use beelot_server::clock::SystemClock;
use beelot_server::config::Config;
use beelot_server::history::HistoryRecorder;
use beelot_server::jobs;
use beelot_server::logs::ErrorLog;
use beelot_server::routes::admin::MIN_TOKEN_CHARS;
use tokio_util::sync::CancellationToken;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Config::from_env()?;
    // The recent warnings and errors are kept for the operator's status page (US-152), next to the formatted log.
    let errors = ErrorLog::new();
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .with(errors.layer())
        .init();

    let bind = config.bind;
    // The privacy policy is never published incomplete, and security events need their token key (US-129).
    let problems = beelot_server::privacy::startup_problems(&config);
    if !problems.is_empty() {
        anyhow::bail!(
            "the server does not start with an incomplete privacy configuration (see the README):\n  {}",
            problems.join("\n  ")
        );
    }
    beelot_server::privacy::tokens::init(&config.ip_token_secret);
    let admin_token = config.admin_token.trim();
    if !admin_token.is_empty() && admin_token.chars().count() < MIN_TOKEN_CHARS {
        anyhow::bail!(
            "BEELOT_ADMIN_TOKEN is too short: use at least {MIN_TOKEN_CHARS} characters (see the README)"
        );
    }
    let pool = beelot_server::db::connect(&config)
        .await
        .context("cannot reach the database: is `docker compose up -d --wait` running?")?;
    let history = Arc::new(HistoryRecorder::new(pool.clone()));
    let state = AppState::new(config, Arc::new(SystemClock))
        .with_pool(pool)
        .with_sink(history)
        .with_error_log(errors);
    let cancel = CancellationToken::new();
    let background = jobs::spawn_all(state.clone(), cancel.clone());
    let listener = tokio::net::TcpListener::bind(bind)
        .await
        .with_context(|| format!("cannot listen on {bind}"))?;
    tracing::info!(%bind, "listening");
    axum::serve(
        listener,
        router(state).into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;
    cancel.cancel();
    for job in background {
        job.await.ok();
    }
    Ok(())
}

/// Resolves on Ctrl-C or SIGTERM.
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.ok();
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut signal) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            signal.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = ctrl_c => {}
        () = terminate => {}
    }
    tracing::info!("shutting down");
}
