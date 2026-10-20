package fr.beelot.application.privacy;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The values of the privacy policy that depend on who runs Beelot (US-083), read from the environment: the data
 * controller, the privacy contact, the hosting provider, and how many days backups are kept. A blank value
 * is not configured.
 */
@ConfigurationProperties("beelot.privacy")
public record PrivacyProperties(String controller, String contact, String hostingProvider,
                                String backupRetentionDays) {
}
