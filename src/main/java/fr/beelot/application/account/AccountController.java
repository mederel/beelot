package fr.beelot.application.account;

import com.fasterxml.jackson.annotation.JsonInclude;
import fr.beelot.application.security.SecurityConfiguration;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Tells the client whether the player is signed in, and where to sign in or create an account. */
@RestController
class AccountController {

    private static final String SIGN_IN_URL = "/oauth2/authorization/" + SecurityConfiguration.REGISTRATION_ID;

    private final AccountService accounts;
    private final ClientRegistrationRepository registrations;

    AccountController(AccountService accounts, ClientRegistrationRepository registrations) {
        this.accounts = accounts;
        this.registrations = registrations;
    }

    @GetMapping("/api/account")
    AccountView account(Authentication authentication) {
        return accounts.current(authentication)
                .map(account -> new AccountView(true, account.displayName(), null, null))
                .orElseGet(this::guest);
    }

    private AccountView guest() {
        boolean offered = registrations.findByRegistrationId(SecurityConfiguration.REGISTRATION_ID) != null;
        return offered ? new AccountView(false, null, SIGN_IN_URL, SIGN_IN_URL + "?register")
                : new AccountView(false, null, null, null);
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record AccountView(boolean signedIn, String name, String signInUrl, String registerUrl) {
    }
}
