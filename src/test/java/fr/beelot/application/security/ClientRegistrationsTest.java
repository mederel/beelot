package fr.beelot.application.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** The providers are read from the environment when the application starts, not when it is built. */
class ClientRegistrationsTest {

    private static final String REGISTRATION = "spring.security.oauth2.client.registration.";

    @Test
    void googleAsksForTheOpenidScopeOnly() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty(REGISTRATION + "google.client-id", "g")
                .withProperty(REGISTRATION + "google.client-secret", "s")
                .withProperty(REGISTRATION + "google.scope", "openid");

        ClientRegistration google = repository(environment).findByRegistrationId("google");

        assertEquals(Set.of("openid"), google.getScopes());
    }

    @Test
    void githubAsksForNoScope() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty(REGISTRATION + "github.client-id", "h")
                .withProperty(REGISTRATION + "github.client-secret", "t");

        ClientRegistration github = repository(environment).findByRegistrationId("github");

        assertEquals(Set.of(), github.getScopes());
        assertEquals("h", github.getClientId());
        assertEquals("https://github.com/login/oauth/authorize", github.getProviderDetails().getAuthorizationUri());
        assertEquals("id", github.getProviderDetails().getUserInfoEndpoint().getUserNameAttributeName());
    }

    @Test
    void aProviderWithoutCredentialsIsNotOffered() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty(REGISTRATION + "google.scope", "openid")
                .withProperty(REGISTRATION + "github.client-id", "h");

        assertNull(repository(environment).findByRegistrationId("google"));
        assertNull(repository(environment).findByRegistrationId("github"));
    }

    private static ClientRegistrationRepository repository(MockEnvironment environment) {
        return new SecurityConfiguration().clientRegistrationRepository(environment);
    }
}
