package fr.beelot.application.privacy;

import com.fasterxml.jackson.annotation.JsonInclude;
import fr.beelot.application.account.Account;
import fr.beelot.application.account.AccountService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The privacy endpoints (US-081 to US-083): the values shown on the privacy policy, and deleting the signed-in
 * player's account, which needs a sign-in less than 10 minutes old.
 */
@RestController
@EnableConfigurationProperties(PrivacyProperties.class)
class PrivacyController {

    private static final Logger LOG = LoggerFactory.getLogger(PrivacyController.class);

    private final PrivacyProperties properties;
    private final AccountService accounts;
    private final AccountDeletionService deletion;
    private final Clock clock;

    PrivacyController(PrivacyProperties properties, AccountService accounts, AccountDeletionService deletion,
                      Clock clock) {
        this.properties = properties;
        this.accounts = accounts;
        this.deletion = deletion;
        this.clock = clock;
    }

    @DeleteMapping("/api/account")
    ResponseEntity<?> deleteAccount(Authentication authentication, HttpServletRequest request) {
        Optional<Account> account = accounts.current(authentication);
        if (account.isEmpty()) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        HttpSession session = request.getSession(false);
        if (session == null || !AccountSessions.signedInRecently(session, clock)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("reason", "reauthenticate"));
        }
        deletion.delete(account.get().id(), request.getRemoteAddr());
        return ResponseEntity.noContent().build();
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
