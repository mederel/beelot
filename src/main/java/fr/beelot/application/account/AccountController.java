package fr.beelot.application.account;

import com.fasterxml.jackson.annotation.JsonInclude;
import fr.beelot.application.privacy.AccountSessions;
import fr.beelot.application.privacy.SecurityEvents;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.webauthn.authentication.WebAuthnAuthentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

/** Tells the client whether the player is signed in with a passkey, and when they last signed in. */
@RestController
class AccountController {

    private final AccountService accounts;

    AccountController(AccountService accounts) {
        this.accounts = accounts;
    }

    @GetMapping("/api/account")
    AccountView account(Authentication authentication, HttpServletRequest request) {
        Optional<Account> account = accounts.current(authentication);
        if (account.isEmpty() && signedIn(authentication)) {
            // The account is gone, deleted while this session was missed: the session goes with it.
            HttpSession session = request.getSession(false);
            if (session != null) {
                try {
                    session.setAttribute(SecurityEvents.ENDED, true);
                    session.invalidate();
                } catch (IllegalStateException alreadyInvalid) {
                    // Ended in the meantime.
                }
            }
        }
        return account.map(found -> new AccountView(true, found.displayName(),
                        Objects.toString(lastSignInElsewhere(found, request.getSession(false)), null)))
                .orElseGet(() -> new AccountView(false, null, null));
    }

    /**
     * The latest sign-in other than this session's own (US-077): one made after it was made elsewhere; otherwise the
     * one before it, if any.
     */
    private static Instant lastSignInElsewhere(Account account, HttpSession session) {
        if (session != null && session.getAttribute(AccountSessions.SIGNED_IN_AT) instanceof Instant own
                && account.lastSignInAt().isAfter(own)) {
            return account.lastSignInAt();
        }
        return account.previousSignInAt();
    }

    private static boolean signedIn(Authentication authentication) {
        return authentication instanceof WebAuthnAuthentication;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record AccountView(boolean signedIn, String name, String lastSignInAt) {
    }
}
