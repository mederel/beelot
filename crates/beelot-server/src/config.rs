//! Configuration, read from the environment and from `.env`.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

/// The values of the privacy policy that depend on who runs Beelot. A blank value is not configured.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PrivacyConfig {
    pub controller: String,
    pub contact: String,
    pub hosting_provider: String,
    /// The reference of the data processing agreement with the hosting provider (US-129).
    pub hosting_agreement: String,
    pub backup_retention_days: String,
}

/// Bounds on what the server keeps and accepts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Limits {
    pub max_request_bytes: usize,
    pub max_header_bytes: usize,
    pub requests_per_window: u32,
    pub creations_per_window: u32,
    pub rate_window: Duration,
    pub max_local_tables: usize,
    pub max_online_tables: usize,
    pub idle_expiry: Duration,
    pub idle_sweep_interval: Duration,
    pub bot_fill_wait: Duration,
    pub matchmaking_sweep_interval: Duration,
    pub reconnect_timeout: Duration,
    pub trick_review: Duration,
    pub passkey_ceremonies_per_ip_per_hour: u32,
    pub anonymous_events_per_ip_per_hour: u32,
    pub anonymous_events_per_hour: u32,
    pub recent_sign_in: Duration,
    pub export_interval: Duration,
    pub event_retention: Duration,
    pub account_retention: Duration,
}

const MINUTE: Duration = Duration::from_secs(60);
const HOUR: Duration = Duration::from_secs(3600);
const DAY: Duration = Duration::from_secs(86_400);

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_request_bytes: 4096,
            max_header_bytes: 8 * 1024,
            requests_per_window: 300,
            creations_per_window: 20,
            rate_window: MINUTE,
            max_local_tables: 5000,
            max_online_tables: 2000,
            idle_expiry: 2 * HOUR,
            idle_sweep_interval: MINUTE,
            bot_fill_wait: MINUTE,
            matchmaking_sweep_interval: Duration::from_secs(5),
            reconnect_timeout: 2 * MINUTE,
            trick_review: Duration::from_secs(4),
            passkey_ceremonies_per_ip_per_hour: 30,
            anonymous_events_per_ip_per_hour: 100,
            anonymous_events_per_hour: 10_000,
            recent_sign_in: 10 * MINUTE,
            export_interval: HOUR,
            event_retention: 365 * DAY,
            account_retention: 3 * 365 * DAY,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    pub bind: SocketAddr,
    pub database_url: String,
    pub database_username: String,
    pub database_password: String,
    pub public_url: String,
    /// The project's repository, where the releases and their notes are (`BEELOT_REPOSITORY_URL`, US-131).
    pub repository_url: String,
    /// The Android app's package and the SHA-256 fingerprints of its signing certificates, for the Digital Asset
    /// Links file (`BEELOT_ANDROID_PACKAGE`, `BEELOT_ANDROID_CERT_SHA256`, US-127).
    pub android_package: String,
    pub android_cert_sha256: Vec<String>,
    /// The key of the IP address tokens in the security events (`BEELOT_IP_TOKEN_SECRET`, US-129): kept outside the
    /// database and the repository, and required to start the server.
    pub ip_token_secret: String,
    /// The key of the daily deal (`BEELOT_DAILY_DEAL_SECRET`, US-150): without it there is no daily deal.
    pub daily_deal_secret: String,
    pub privacy: PrivacyConfig,
    pub trust_forwarded_headers: bool,
    /// The frontend's files: `BEELOT_STATIC_DIR`, by default the crate's `static/` folder.
    pub static_dir: PathBuf,
    pub limits: Limits,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            bind: SocketAddr::from(([0, 0, 0, 0], 8080)),
            database_url: "mysql://localhost:3306/beelot".into(),
            database_username: "beelot".into(),
            database_password: "beelot".into(),
            public_url: "http://localhost:8080".into(),
            repository_url: "https://github.com/mederel/beelot".into(),
            android_package: "fr.beelot.app".into(),
            android_cert_sha256: Vec::new(),
            ip_token_secret: String::new(),
            daily_deal_secret: String::new(),
            privacy: PrivacyConfig::default(),
            trust_forwarded_headers: false,
            static_dir: PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/static")),
            limits: Limits::default(),
        }
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ConfigError {
    #[error("{name} is not valid: {value}")]
    Invalid { name: &'static str, value: String },
}

impl Config {
    /// Reads `.env` when there is one, then the environment.
    pub fn from_env() -> Result<Config, ConfigError> {
        dotenvy::dotenv().ok();
        Self::from_vars(|name| std::env::var(name).ok())
    }

    /// Builds the configuration from a variable lookup, with the defaults for unset variables.
    pub fn from_vars(var: impl Fn(&str) -> Option<String>) -> Result<Config, ConfigError> {
        let defaults = Config::default();
        let text = |name: &str, default: String| var(name).unwrap_or(default);
        let bind = match var("BEELOT_BIND") {
            Some(value) => value.parse().map_err(|_| ConfigError::Invalid {
                name: "BEELOT_BIND",
                value,
            })?,
            None => defaults.bind,
        };
        let trust_forwarded_headers = match var("BEELOT_TRUST_FORWARDED_HEADERS") {
            Some(value) => match value.trim().to_ascii_lowercase().as_str() {
                "true" | "1" | "yes" => true,
                "false" | "0" | "no" | "" => false,
                _ => {
                    return Err(ConfigError::Invalid {
                        name: "BEELOT_TRUST_FORWARDED_HEADERS",
                        value,
                    });
                }
            },
            None => false,
        };
        let public_url = text("BEELOT_PUBLIC_URL", defaults.public_url);
        if let Err(problem) = crate::auth::relying_party::RelyingParty::of(&public_url) {
            return Err(ConfigError::Invalid {
                name: "BEELOT_PUBLIC_URL",
                value: problem,
            });
        }
        let mut android_cert_sha256 = Vec::new();
        for fingerprint in var("BEELOT_ANDROID_CERT_SHA256")
            .unwrap_or_default()
            .split(',')
            .filter(|fingerprint| !fingerprint.trim().is_empty())
        {
            match crate::routes::assetlinks::normalize_fingerprint(fingerprint) {
                Some(fingerprint) => android_cert_sha256.push(fingerprint),
                None => {
                    return Err(ConfigError::Invalid {
                        name: "BEELOT_ANDROID_CERT_SHA256",
                        value: fingerprint.trim().to_string(),
                    });
                }
            }
        }
        Ok(Config {
            bind,
            database_url: text("BEELOT_DATABASE_URL", defaults.database_url),
            database_username: text("BEELOT_DATABASE_USERNAME", defaults.database_username),
            database_password: text("BEELOT_DATABASE_PASSWORD", defaults.database_password),
            public_url,
            repository_url: text("BEELOT_REPOSITORY_URL", defaults.repository_url),
            android_package: text("BEELOT_ANDROID_PACKAGE", defaults.android_package),
            android_cert_sha256,
            ip_token_secret: text("BEELOT_IP_TOKEN_SECRET", String::new()),
            daily_deal_secret: text("BEELOT_DAILY_DEAL_SECRET", String::new()),
            privacy: PrivacyConfig {
                controller: text("BEELOT_PRIVACY_CONTROLLER", String::new()),
                contact: text("BEELOT_PRIVACY_CONTACT", String::new()),
                hosting_provider: text("BEELOT_HOSTING_PROVIDER", String::new()),
                hosting_agreement: text("BEELOT_HOSTING_DPA", String::new()),
                backup_retention_days: text("BEELOT_BACKUP_RETENTION_DAYS", String::new()),
            },
            trust_forwarded_headers,
            static_dir: var("BEELOT_STATIC_DIR")
                .map(PathBuf::from)
                .unwrap_or(defaults.static_dir),
            limits: Limits::default(),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    fn from(pairs: &[(&str, &str)]) -> Result<Config, ConfigError> {
        let vars: HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        Config::from_vars(|name| vars.get(name).cloned())
    }

    #[test]
    fn unset_variables_give_the_defaults() {
        assert_eq!(from(&[]).unwrap(), Config::default());
    }

    #[test]
    fn variables_override_the_defaults() {
        let config = from(&[
            ("BEELOT_BIND", "127.0.0.1:9000"),
            ("BEELOT_DATABASE_URL", "mysql://db:3306/x"),
            ("BEELOT_PUBLIC_URL", "https://beelot.fr"),
            ("BEELOT_PRIVACY_CONTACT", "privacy@beelot.fr"),
            ("BEELOT_REPOSITORY_URL", "https://example.org/fork"),
            ("BEELOT_TRUST_FORWARDED_HEADERS", "true"),
        ])
        .unwrap();
        assert_eq!(config.bind, "127.0.0.1:9000".parse().unwrap());
        assert_eq!(config.database_url, "mysql://db:3306/x");
        assert_eq!(config.public_url, "https://beelot.fr");
        assert_eq!(config.privacy.contact, "privacy@beelot.fr");
        assert_eq!(config.repository_url, "https://example.org/fork");
        assert!(config.trust_forwarded_headers);
    }

    #[test]
    fn the_android_fingerprints_are_read_and_checked() {
        let one = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";
        let two = one.replace("14", "15").to_lowercase();
        let config = from(&[
            ("BEELOT_ANDROID_PACKAGE", "org.example.app"),
            (
                "BEELOT_ANDROID_CERT_SHA256",
                format!("{one}, {two}").as_str(),
            ),
        ])
        .unwrap();
        assert_eq!(config.android_package, "org.example.app");
        assert_eq!(
            config.android_cert_sha256,
            [one.to_string(), two.to_uppercase()]
        );
        assert!(from(&[("BEELOT_ANDROID_CERT_SHA256", "not a fingerprint")]).is_err());
    }

    #[test]
    fn invalid_values_are_refused() {
        assert!(from(&[("BEELOT_BIND", "nowhere")]).is_err());
        assert!(from(&[("BEELOT_TRUST_FORWARDED_HEADERS", "maybe")]).is_err());
        assert!(from(&[("BEELOT_PUBLIC_URL", "beelot.fr")]).is_err());
    }
}
