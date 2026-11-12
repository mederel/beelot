//! Privacy: the security event log, the player's data export, account deletion, retention, and the values the
//! privacy policy shows.

pub mod deletion;
pub mod events;
pub mod export;
pub mod retention;
pub mod tokens;

use crate::config::PrivacyConfig;

/// A policy value as the policy shows it: trimmed, or none when blank.
pub fn policy_value(value: &str) -> Option<&str> {
    Some(value.trim()).filter(|value| !value.is_empty())
}

/// The shortest secret for the IP address tokens.
pub const MIN_IP_TOKEN_SECRET: usize = 16;

/// What stops the server from starting (US-129): a policy value or the token secret that is not set. The policy is
/// never published incomplete, so each of these is required.
pub fn startup_problems(config: &crate::config::Config) -> Vec<String> {
    let mut problems: Vec<String> = unset_policy_values(&config.privacy)
        .into_iter()
        .map(|variable| format!("{variable} is not set"))
        .collect();
    if config.ip_token_secret.trim().len() < MIN_IP_TOKEN_SECRET {
        problems.push(format!(
            "BEELOT_IP_TOKEN_SECRET must be a secret of at least {MIN_IP_TOKEN_SECRET} characters"
        ));
    }
    problems
}

/// The variables the policy needs that are not set.
pub fn unset_policy_values(privacy: &PrivacyConfig) -> Vec<&'static str> {
    [
        (&privacy.controller, "BEELOT_PRIVACY_CONTROLLER"),
        (&privacy.contact, "BEELOT_PRIVACY_CONTACT"),
        (&privacy.hosting_provider, "BEELOT_HOSTING_PROVIDER"),
        (&privacy.hosting_country, "BEELOT_HOSTING_COUNTRY"),
        (&privacy.hosting_agreement, "BEELOT_HOSTING_DPA"),
        (
            &privacy.backup_retention_days,
            "BEELOT_BACKUP_RETENTION_DAYS",
        ),
    ]
    .into_iter()
    .filter(|(value, _)| policy_value(value).is_none())
    .map(|(_, variable)| variable)
    .collect()
}

#[cfg(test)]
mod tests {
    const POLICY: &str = include_str!("../../static/privacy-policy.json");

    #[test]
    fn the_policy_states_the_retention_the_code_enforces() {
        use crate::auth::sessions::{ABSOLUTE_LIMIT, IDLE_LIMIT};
        let policy: serde_json::Value = serde_json::from_str(POLICY).expect("the policy is JSON");
        let stated = &policy["retention"];
        assert_eq!(
            stated["securityEventDays"],
            retention::EVENT_RETENTION.whole_days()
        );
        assert_eq!(stated["accountYears"], retention::ACCOUNT_RETENTION_YEARS);
        assert_eq!(stated["sessionIdleDays"], IDLE_LIMIT.as_secs() / 86_400);
        assert_eq!(
            stated["sessionAbsoluteDays"],
            ABSOLUTE_LIMIT.as_secs() / 86_400
        );
    }

    #[test]
    fn the_policy_is_dated_and_has_every_section() {
        let policy: serde_json::Value = serde_json::from_str(POLICY).expect("the policy is JSON");
        assert_eq!(policy["version"].as_str().map(str::len), Some(10));
        assert_eq!(policy["sections"].as_array().map(Vec::len), Some(11));
    }

    use super::*;
    use crate::config::Config;

    fn complete() -> Config {
        Config {
            privacy: PrivacyConfig {
                controller: "Beelot SAS".into(),
                contact: "privacy@example.org".into(),
                hosting_provider: "Hosting".into(),
                hosting_country: "France".into(),
                hosting_agreement: "DPA-1".into(),
                backup_retention_days: "30".into(),
            },
            ip_token_secret: "a-secret-of-enough-length".into(),
            ..Config::default()
        }
    }

    #[test]
    fn a_complete_configuration_starts() {
        assert!(startup_problems(&complete()).is_empty());
    }

    #[test]
    fn each_missing_value_is_named() {
        let problems = startup_problems(&Config::default());
        for variable in [
            "BEELOT_PRIVACY_CONTROLLER",
            "BEELOT_PRIVACY_CONTACT",
            "BEELOT_HOSTING_PROVIDER",
            "BEELOT_HOSTING_COUNTRY",
            "BEELOT_HOSTING_DPA",
            "BEELOT_BACKUP_RETENTION_DAYS",
            "BEELOT_IP_TOKEN_SECRET",
        ] {
            assert!(
                problems.iter().any(|problem| problem.contains(variable)),
                "{variable} in {problems:?}"
            );
        }
    }

    #[test]
    fn a_blank_value_or_a_short_secret_does_not_start() {
        let mut config = complete();
        config.privacy.contact = "   ".into();
        config.ip_token_secret = "short".into();
        let problems = startup_problems(&config);
        assert_eq!(problems.len(), 2, "{problems:?}");
    }
}
