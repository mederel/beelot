package fr.beelot.application.account;

import fr.beelot.application.security.SecurityConfiguration;
import fr.beelot.application.security.ZitadelApiException;
import fr.beelot.application.security.ZitadelProperties;
import fr.beelot.application.security.ZitadelUsers;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Set;

/**
 * Deletes, through Zitadel, the users who did not confirm their address within the retention and never signed in to
 * Beelot (US-076). It runs only when Zitadel's API token is set; it checks at each run rather than through a
 * condition, because the native image fixes conditions when it is built.
 */
@Component
public class UnconfirmedAccountCleanup {

    private static final Logger LOG = LoggerFactory.getLogger(UnconfirmedAccountCleanup.class);

    private final ZitadelProperties zitadel;
    private final ZitadelUsers users;
    private final AccountRepository accounts;
    private final Clock clock;
    private final Duration retention;

    UnconfirmedAccountCleanup(ZitadelProperties zitadel, ZitadelUsers users, AccountRepository accounts, Clock clock,
                              @Value("${beelot.account.unconfirmed-retention:P7D}") Duration retention) {
        this.zitadel = zitadel;
        this.users = users;
        this.accounts = accounts;
        this.clock = clock;
        this.retention = retention;
    }

    /** Returns the number of users deleted. */
    @Scheduled(fixedDelayString = "${beelot.account.cleanup-interval:PT1H}", initialDelayString = "PT1M")
    public int cleanUp() {
        if (!zitadel.apiConfigured()) {
            return 0;
        }
        List<String> candidates;
        try {
            candidates = users.unconfirmedCreatedBefore(clock.instant().minus(retention));
        } catch (ZitadelApiException e) {
            LOG.warn("Could not list unconfirmed Zitadel users: {}", e.getMessage());
            return 0;
        }
        if (candidates.isEmpty()) {
            return 0;
        }
        Set<String> players = accounts.findProviderSubjects(SecurityConfiguration.REGISTRATION_ID, candidates);
        int deleted = 0;
        for (String userId : candidates) {
            if (players.contains(userId)) {
                continue;
            }
            try {
                users.delete(userId);
                deleted++;
            } catch (ZitadelApiException e) {
                LOG.warn("Could not delete unconfirmed Zitadel user {}: {}", userId, e.getMessage());
            }
        }
        if (deleted > 0) {
            LOG.info("Deleted {} unconfirmed Zitadel users", deleted);
        }
        return deleted;
    }
}
