package fr.beelot.application.account;

import com.fasterxml.jackson.annotation.JsonInclude;
import fr.beelot.application.privacy.AccountSessions;
import fr.beelot.application.privacy.SecurityEvents;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.authentication.ott.OneTimeTokenAuthentication;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * Tells the client whether the player is signed in, and how to sign in: with a link sent by email, or with a configured
 * provider.
 */
@RestController
class AccountController {

    private static final List<String> KNOWN_PROVIDERS = List.of("google", "github");

    private final AccountService accounts;
    private final ClientRegistrationRepository registrations;

    AccountController(AccountService accounts, ClientRegistrationRepository registrations) {
        this.accounts = accounts;
        this.registrations = registrations;
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
        // A signed-in player is offered the same ways to sign in: deleting the account asks for a fresh sign-in.
        return account.map(found -> new AccountView(true, found.displayName(),
                        Objects.toString(lastSignInElsewhere(found, request.getSession(false)), null), true,
                        providers()))
                .orElseGet(() -> new AccountView(false, null, null, true, providers()));
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
        return authentication instanceof OAuth2AuthenticationToken
                || authentication instanceof OneTimeTokenAuthentication;
    }

    private List<Provider> providers() {
        List<Provider> providers = new ArrayList<>();
        for (String id : KNOWN_PROVIDERS) {
            ClientRegistration registration = registrations.findByRegistrationId(id);
            if (registration != null) {
                providers.add(new Provider(id, registration.getClientName(), "/oauth2/authorization/" + id));
            }
        }
        return providers;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record AccountView(boolean signedIn, String name, String lastSignInAt, Boolean emailSignIn,
                       List<Provider> providers) {
    }

    record Provider(String id, String name, String signInUrl) {
    }
}
