package fr.beelot.application.account;

import com.fasterxml.jackson.annotation.JsonInclude;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Tells the client whether the player is signed in, and how a guest can sign in: with a link sent by email, or with a
 * configured provider.
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
        return account.map(found -> new AccountView(true, found.displayName(), null, null))
                .orElseGet(() -> new AccountView(false, null, true, providers()));
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
    record AccountView(boolean signedIn, String name, Boolean emailSignIn, List<Provider> providers) {
    }

    record Provider(String id, String name, String signInUrl) {
    }
}
