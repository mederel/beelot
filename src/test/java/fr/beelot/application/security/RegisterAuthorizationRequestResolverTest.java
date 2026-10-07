package fr.beelot.application.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class RegisterAuthorizationRequestResolverTest {

    private final RegisterAuthorizationRequestResolver resolver = new RegisterAuthorizationRequestResolver(
            new InMemoryClientRegistrationRepository(SecurityConfiguration.zitadelRegistration(
                    new ZitadelProperties("https://zitadel.test", "beelot-test", "test-secret"))));

    @Test
    void theRegisterLinkOpensZitadelsRegistrationForm() {
        MockHttpServletRequest request = authorizationRequest();
        request.setParameter("register", "");

        assertEquals("create", resolver.resolve(request).getAdditionalParameters().get("prompt"));
    }

    @Test
    void theSignInLinkDoesNot() {
        assertNull(resolver.resolve(authorizationRequest()).getAdditionalParameters().get("prompt"));
    }

    private static MockHttpServletRequest authorizationRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/oauth2/authorization/zitadel");
        request.setServletPath("/oauth2/authorization/zitadel");
        return request;
    }
}
