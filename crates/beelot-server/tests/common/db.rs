//! One MariaDB container per test binary, and a fresh database for each test. Docker must be running.
//!
//! With `BEELOT_TEST_MARIADB_PORT` set, the tests use the MariaDB already listening on that port of 127.0.0.1 (as root,
//! without a password: `docker run -d -p 3307:3306 -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 mariadb:12.3`) and start no
//! container. CI does so: one server for every test, which cargo-nextest's process per test needs. The databases the tests
//! create are not dropped: give it a server you throw away.

use std::sync::OnceLock;

use sqlx::Executor;
use sqlx::mysql::{MySqlConnectOptions, MySqlPool, MySqlPoolOptions};
use testcontainers_modules::mariadb::Mariadb;
use testcontainers_modules::testcontainers::ImageExt;
use testcontainers_modules::testcontainers::runners::AsyncRunner;

/// The container's id and its host port. The container is never dropped: [`remove_on_exit`] removes it.
static SERVER: OnceLock<(String, u16)> = OnceLock::new();

fn server() -> &'static (String, u16) {
    SERVER.get_or_init(|| {
        if let Some(port) = std::env::var("BEELOT_TEST_MARIADB_PORT")
            .ok()
            .filter(|port| !port.is_empty())
        {
            let port = port
                .parse()
                .expect("BEELOT_TEST_MARIADB_PORT is a port number");
            return (String::new(), port);
        }
        // The container is started on a runtime of its own, which outlives every test's runtime.
        std::thread::spawn(|| {
            let runtime = tokio::runtime::Runtime::new().unwrap();
            let container = runtime
                .block_on(Mariadb::default().with_tag("12.3").start())
                .expect("a MariaDB container: is Docker running?");
            let port = runtime
                .block_on(container.get_host_port_ipv4(3306))
                .unwrap();
            let id = container.id().to_owned();
            remove_on_exit(&id);
            std::mem::forget(container);
            std::mem::forget(runtime);
            (id, port)
        })
        .join()
        .unwrap()
    })
}

/// Starts a shell that removes the container once this process has exited, however it exits. It has a process
/// group of its own, so a Ctrl-C in the terminal does not stop it too.
#[allow(clippy::zombie_processes)] // The shell outlives this process, so nothing waits on it.
fn remove_on_exit(id: &str) {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};

    let pid = std::process::id();
    Command::new("sh")
        .arg("-c")
        .arg(format!(
            "while kill -0 {pid} 2>/dev/null; do sleep 1; done; docker rm -f {id}"
        ))
        .process_group(0)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("a shell to remove the container");
}

fn options(port: u16) -> MySqlConnectOptions {
    MySqlConnectOptions::new()
        .host("127.0.0.1")
        .port(port)
        .username("root")
}

/// A pool on a new, migrated database of its own.
pub async fn test_pool() -> MySqlPool {
    let (_, port) = server();
    let name = format!("t_{}", uuid::Uuid::new_v4().simple());
    let admin = MySqlPoolOptions::new()
        .max_connections(1)
        .connect_with(options(*port))
        .await
        .unwrap();
    admin
        .execute(sqlx::AssertSqlSafe(format!(
            "CREATE DATABASE {name} CHARACTER SET utf8mb4"
        )))
        .await
        .unwrap();
    admin.close().await;
    let pool = MySqlPoolOptions::new()
        .max_connections(5)
        .connect_with(options(*port).database(&name))
        .await
        .unwrap();
    beelot_server::db::migrate(&pool).await.unwrap();
    pool
}
