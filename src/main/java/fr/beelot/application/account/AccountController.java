package fr.beelot.application.account;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/** Tells the client whether the player is signed in, and which providers they can sign in with. */
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
    AccountView account(Authentication authentication) {
        return accounts.current(authentication)
                .map(account -> new AccountView(true, account.displayName(), account.provider(), providers()))
                .orElseGet(() -> new AccountView(false, null, null, providers()));
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

    record AccountView(boolean signedIn, String name, String provider, List<Provider> providers) {
    }

    record Provider(String id, String name, String signInUrl) {
    }
}
