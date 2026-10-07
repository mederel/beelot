package fr.beelot.application.account;

import org.springframework.context.annotation.ImportRuntimeHints;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Finds or creates the account of a player signing in through the identity provider. Beelot knows a player only by
 * the provider's user id and a random pseudonym (US-075).
 */
@Service
@ImportRuntimeHints(AccountRuntimeHints.class)
public class AccountService {

    private final AccountRepository accounts;
    private final PseudonymGenerator pseudonyms;
    private final Clock clock = Clock.systemUTC();

    AccountService(AccountRepository accounts, PseudonymGenerator pseudonyms) {
        this.accounts = accounts;
        this.pseudonyms = pseudonyms;
    }

    /**
     * The account of the provider's user, created on the first sign-in with a pseudonym in the player's language.
     * Later sign-ins keep the pseudonym.
     */
    @Transactional
    public Account signIn(String provider, String subject, Locale locale) {
        Optional<Account> existing = accounts.findByProviderAndProviderSubject(provider, subject);
        if (existing.isPresent()) {
            existing.get().signedIn(clock.instant());
            return existing.get();
        }
        return accounts.save(new Account(provider, subject, pseudonyms.generate(locale), clock.instant()));
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
}
