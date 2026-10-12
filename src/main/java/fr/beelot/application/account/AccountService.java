package fr.beelot.application.account;

import org.springframework.context.annotation.ImportRuntimeHints;
import org.springframework.security.authentication.ott.OneTimeTokenAuthentication;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Finds or creates the account of a player signing in with an OAuth provider or an email link. Beelot knows a player only by
 * the provider's user id and a random pseudonym (US-075).
 */
@Service
@ImportRuntimeHints(AccountRuntimeHints.class)
public class AccountService {

    private final AccountRepository accounts;
    private final AccountEmailRepository emails;
    private final PseudonymGenerator pseudonyms;
    private final Clock clock = Clock.systemUTC();

    AccountService(AccountRepository accounts, AccountEmailRepository emails, PseudonymGenerator pseudonyms) {
        this.accounts = accounts;
        this.emails = emails;
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

    /**
     * The account of an address, created on the first sign-in link with a pseudonym in the player's language. The
     * address must already be normalised, see {@link EmailAddresses#normalise}.
     */
    @Transactional
    public Account signInWithEmail(String email, Locale locale) {
        Optional<AccountEmail> existing = emails.findByEmail(email);
        if (existing.isPresent()) {
            Account account = accounts.findById(existing.get().accountId()).orElseThrow();
            account.signedIn(clock.instant());
            return account;
        }
        Account account = accounts.save(Account.withEmail(pseudonyms.generate(locale), clock.instant()));
        emails.save(new AccountEmail(account.id(), email));
        return account;
    }

    /** The account of a player signed in with an OAuth provider or an email link, or empty for a guest. */
    @Transactional(readOnly = true)
    public Optional<Account> current(Authentication authentication) {
        if (authentication instanceof OAuth2AuthenticationToken token) {
            return accounts.findByProviderAndProviderSubject(token.getAuthorizedClientRegistrationId(), token.getName());
        }
        if (authentication instanceof OneTimeTokenAuthentication) {
            return emails.findByEmail(authentication.getName())
                    .flatMap(email -> accounts.findById(email.accountId()));
        }
        return Optional.empty();
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
