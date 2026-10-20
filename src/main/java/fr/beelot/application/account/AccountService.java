package fr.beelot.application.account;

import org.springframework.context.annotation.ImportRuntimeHints;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialCreationOptions;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.authentication.WebAuthnAuthentication;
import org.springframework.security.web.webauthn.management.ImmutableRelyingPartyRegistrationRequest;
import org.springframework.security.web.webauthn.management.RelyingPartyPublicKey;
import org.springframework.security.web.webauthn.management.WebAuthnRelyingPartyOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Creates accounts and finds the account of a player signed in with a passkey. Beelot knows a player only by a random
 * id, which is the name of the passkey's user, and a random pseudonym (US-084).
 */
@Service
@ImportRuntimeHints(AccountRuntimeHints.class)
public class AccountService {

    private final AccountRepository accounts;
    private final PseudonymGenerator pseudonyms;
    private final WebAuthnRelyingPartyOperations relyingParty;
    private final Clock clock = Clock.systemUTC();

    AccountService(AccountRepository accounts, PseudonymGenerator pseudonyms,
                   WebAuthnRelyingPartyOperations relyingParty) {
        this.accounts = accounts;
        this.pseudonyms = pseudonyms;
        this.relyingParty = relyingParty;
    }

    /** A new account, named with a pseudonym in the player's language. */
    @Transactional
    public Account create(Locale locale) {
        return accounts.save(new Account(pseudonyms.generate(locale), clock.instant()));
    }

    /**
     * Signs up: verifies the new passkey against the creation options and stores it, then creates the account named
     * by the options' user, under its pseudonym. Either both are stored or neither; a passkey that fails its
     * verification throws.
     */
    @Transactional
    public Account register(PublicKeyCredentialCreationOptions options, RelyingPartyPublicKey key) {
        relyingParty.registerCredential(new ImmutableRelyingPartyRegistrationRequest(options, key));
        PublicKeyCredentialUserEntity user = options.getUser();
        return accounts.save(new Account(UUID.fromString(user.getName()), user.getDisplayName(), clock.instant()));
    }

    /** Records a sign-in to the account, or is empty when the account is gone. */
    @Transactional
    public Optional<Account> signIn(UUID accountId) {
        Optional<Account> account = accounts.findById(accountId);
        account.ifPresent(found -> found.signedIn(clock.instant()));
        return account;
    }

    /** The account of a player signed in with a passkey, or empty for a guest. */
    @Transactional(readOnly = true)
    public Optional<Account> current(Authentication authentication) {
        if (authentication instanceof WebAuthnAuthentication) {
            try {
                return accounts.findById(UUID.fromString(authentication.getName()));
            } catch (IllegalArgumentException notAnAccountId) {
                return Optional.empty();
            }
        }
        return Optional.empty();
    }

    /** Whether the account exists. */
    @Transactional(readOnly = true)
    public boolean exists(UUID accountId) {
        return accounts.existsById(accountId);
    }

    /** The current name of an account. */
    @Transactional(readOnly = true)
    public Optional<String> displayName(UUID accountId) {
        return accounts.findById(accountId).map(Account::displayName);
    }

    /** The account id of a player signed in with a passkey, or null for a guest. */
    public UUID currentId(Authentication authentication) {
        return current(authentication).map(Account::id).orElse(null);
    }
}
