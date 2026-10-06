package fr.beelot.application.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** Providers are read from the environment when the application starts, not when it is built. */
class ClientRegistrationsTest {

    @Test
    void noProviderIsOfferedWithoutCredentials() {
        ClientRegistrationRepository registrations = new SecurityConfiguration()
                .clientRegistrationRepository(new MockEnvironment());

        assertNull(registrations.findByRegistrationId("github"));
        assertNull(registrations.findByRegistrationId("google"));
    }

    @Test
    void aProviderWithCredentialsIsOffered() {
        ClientRegistrationRepository registrations = new SecurityConfiguration().clientRegistrationRepository(
                new MockEnvironment()
                        .withProperty("spring.security.oauth2.client.registration.github.client-id", "id")
                        .withProperty("spring.security.oauth2.client.registration.github.client-secret", "secret"));

        assertEquals("GitHub", registrations.findByRegistrationId("github").getClientName());
        assertNull(registrations.findByRegistrationId("google"));
    }
}
