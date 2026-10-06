package fr.beelot.application.account;

import org.springframework.context.annotation.ImportRuntimeHints;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Finds or creates the account of a player signing in with an OAuth provider. */
@Service
@ImportRuntimeHints(AccountRuntimeHints.class)
public class AccountService {

    static final int MAX_NAME_LENGTH = 30;
    private static final String FALLBACK_NAME = "Player";

    private final AccountRepository accounts;
    private final Clock clock = Clock.systemUTC();

    AccountService(AccountRepository accounts) {
        this.accounts = accounts;
    }

    /**
     * The account of the provider's user, created on the first sign-in. Its name follows the provider's profile:
     * the name, else the login, shortened to 30 characters.
     */
    @Transactional
    public Account signIn(String provider, String subject, Map<String, Object> attributes) {
        String name = displayName(attributes);
        Optional<Account> existing = accounts.findByProviderAndProviderSubject(provider, subject);
        if (existing.isPresent()) {
            existing.get().signedIn(name, clock.instant());
            return existing.get();
        }
        return accounts.save(new Account(provider, subject, name, clock.instant()));
    }

    /** The account of a player signed in with an OAuth provider, or empty for a guest. */
    @Transactional(readOnly = true)
    public Optional<Account> current(Authentication authentication) {
        if (!(authentication instanceof OAuth2AuthenticationToken token)) return Optional.empty();
        return accounts.findByProviderAndProviderSubject(token.getAuthorizedClientRegistrationId(), token.getName());
    }

    /** The current name of an account. */
    @Transactional(readOnly = true)
    public Optional<String> displayName(UUID accountId) {
        return accounts.findById(accountId).map(Account::displayName);
    }

    /** The account id of a player signed in with an OAuth provider, or null for a guest. */
    public UUID currentId(Authentication authentication) {
        return current(authentication).map(Account::id).orElse(null);
    }

    static String displayName(Map<String, Object> attributes) {
        for (String key : new String[] {"name", "login", "given_name"}) {
            if (attributes.get(key) instanceof String value && !value.isBlank()) {
                String name = value.strip();
                return name.length() > MAX_NAME_LENGTH ? name.substring(0, MAX_NAME_LENGTH).strip() : name;
            }
        }
        return FALLBACK_NAME;
    }
}
