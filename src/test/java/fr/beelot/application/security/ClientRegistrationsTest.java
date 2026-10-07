package fr.beelot.application.security;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** The Zitadel client is read from the environment when the application starts, not when it is built. */
class ClientRegistrationsTest {

    @Test
    void signInIsNotOfferedWithoutTheZitadelClient() {
        ClientRegistrationRepository registrations = new SecurityConfiguration()
                .clientRegistrationRepository(new ZitadelProperties("https://zitadel.test", "", "secret"));

        assertNull(registrations.findByRegistrationId("zitadel"));
    }

    @Test
    void theZitadelClientAsksForTheUserIdOnly() {
        ClientRegistration registration = new SecurityConfiguration()
                .clientRegistrationRepository(new ZitadelProperties("https://zitadel.test/", "id", "secret"))
                .findByRegistrationId("zitadel");

        assertEquals(Set.of("openid"), registration.getScopes());
        assertEquals("https://zitadel.test", registration.getProviderDetails().getIssuerUri());
        assertEquals("https://zitadel.test/oauth/v2/authorize",
                registration.getProviderDetails().getAuthorizationUri());
        assertEquals("https://zitadel.test/oauth/v2/token", registration.getProviderDetails().getTokenUri());
        assertEquals("https://zitadel.test/oauth/v2/keys", registration.getProviderDetails().getJwkSetUri());
        assertEquals("https://zitadel.test/oidc/v1/end_session",
                registration.getProviderDetails().getConfigurationMetadata().get("end_session_endpoint"));
        assertNull(registration.getProviderDetails().getUserInfoEndpoint().getUri());
    }
}
