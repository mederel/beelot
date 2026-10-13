package fr.beelot.application.privacy;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.event.EventListener;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/** The privacy endpoints (US-081 to US-083): the values shown on the privacy policy. */
@RestController
@EnableConfigurationProperties(PrivacyProperties.class)
class PrivacyController {

    private static final Logger LOG = LoggerFactory.getLogger(PrivacyController.class);

    private final PrivacyProperties properties;

    PrivacyController(PrivacyProperties properties) {
        this.properties = properties;
    }

    @GetMapping("/api/privacy/policy-info")
    PolicyInfo policyInfo() {
        return new PolicyInfo(valueOf(properties.controller()), valueOf(properties.contact()),
                valueOf(properties.hostingProvider()), valueOf(properties.smtpProvider()),
                valueOf(properties.backupRetentionDays()));
    }

    /** The policy shows "not configured" for each value missing here; the operator is told once, at startup. */
    @EventListener(ApplicationReadyEvent.class)
    void warnAboutUnsetValues() {
        List<String> unset = new ArrayList<>();
        addIfUnset(unset, properties.controller(), "BEELOT_PRIVACY_CONTROLLER");
        addIfUnset(unset, properties.contact(), "BEELOT_PRIVACY_CONTACT");
        addIfUnset(unset, properties.hostingProvider(), "BEELOT_HOSTING_PROVIDER");
        addIfUnset(unset, properties.smtpProvider(), "BEELOT_SMTP_PROVIDER");
        addIfUnset(unset, properties.backupRetentionDays(), "BEELOT_BACKUP_RETENTION_DAYS");
        if (!unset.isEmpty()) {
            LOG.warn("The privacy policy shows \"not configured\" until these are set: {}", String.join(", ", unset));
        }
    }

    private static void addIfUnset(List<String> unset, String value, String variable) {
        if (!StringUtils.hasText(value)) {
            unset.add(variable);
        }
    }

    private static String valueOf(String value) {
        return StringUtils.hasText(value) ? value.strip() : null;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record PolicyInfo(String controller, String contact, String hostingProvider, String smtpProvider,
                      String backupRetentionDays) {
    }
}
