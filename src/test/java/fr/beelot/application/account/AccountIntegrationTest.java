package fr.beelot.application.account;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static fr.beelot.application.account.PseudonymGeneratorTest.withoutNumber;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Signing in end to end, on a MariaDB database migrated by Flyway, with Zitadel configured. The issuer never
 * resolves, which also shows the server starts without reaching Zitadel.
 */
@SpringBootTest(properties = {
        "beelot.zitadel.issuer=https://zitadel.test",
        "beelot.zitadel.client-id=beelot-test",
        "beelot.zitadel.client-secret=test-secret"})
@AutoConfigureMockMvc
@Testcontainers
class AccountIntegrationTest {

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SignInSuccessHandler signInSuccessHandler;

    @Autowired
    private AccountRepository accounts;

    @Autowired
    private ClientRegistrationRepository registrations;

    @Test
    void aGuestIsOfferedToSignInOrCreateAnAccount() throws Exception {
        mockMvc.perform(get("/api/account"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signedIn").value(false))
                .andExpect(jsonPath("$.signInUrl").value("/oauth2/authorization/zitadel"))
                .andExpect(jsonPath("$.registerUrl").value("/oauth2/authorization/zitadel?register"))
                .andExpect(jsonPath("$.name").doesNotExist());
    }

    @Test
    void signingInStartsZitadelsAuthorisationFlowWithTheOpenidScopeOnly() throws Exception {
        mockMvc.perform(get("/oauth2/authorization/zitadel"))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> {
                    String redirect = result.getResponse().getRedirectedUrl();
                    assertTrue(redirect.startsWith("https://zitadel.test/oauth/v2/authorize?"), redirect);
                    assertTrue(redirect.matches(".*[?&]scope=openid(&.*)?$"), redirect);
                    assertFalse(redirect.contains("prompt="), redirect);
                });
    }

    @Test
    void creatingAnAccountOpensTheRegistrationForm() throws Exception {
        mockMvc.perform(get("/oauth2/authorization/zitadel").param("register", ""))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> assertTrue(result.getResponse().getRedirectedUrl().contains("prompt=create")));
    }

    @Test
    void theFirstSignInCreatesTheAccountUnderAPseudonym() throws Exception {
        signIn(oidcUser("u-1", "id-token-1"));
        signIn(oidcUser("u-1", "id-token-1"));

        List<Account> created = accounts.findAll().stream()
                .filter(account -> account.provider().equals("zitadel")).toList();
        assertEquals(1, created.size());
        String name = created.getFirst().displayName();
        assertTrue(PseudonymGenerator.all(Locale.FRENCH).contains(withoutNumber(name)), name);
        mockMvc.perform(get("/api/account").with(oidcLogin()
                        .idToken(token -> token.subject("u-1"))
                        .clientRegistration(registrations.findByRegistrationId("zitadel"))))
                .andExpect(jsonPath("$.signedIn").value(true))
                .andExpect(jsonPath("$.name").value(name))
                .andExpect(jsonPath("$.signInUrl").doesNotExist());
    }

    @Test
    void signingOutAlsoEndsTheZitadelSession() throws Exception {
        Cookie csrfToken = mockMvc.perform(get("/api/account")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        mockMvc.perform(post("/logout").session(new MockHttpSession()).cookie(csrfToken)
                        .header("X-XSRF-TOKEN", csrfToken.getValue()).with(oidcLogin()
                        .idToken(token -> token.subject("u-2").tokenValue("id-token-2"))
                        .clientRegistration(registrations.findByRegistrationId("zitadel"))))
                .andExpect(status().isOk())
                .andExpect(result -> {
                    String logoutUrl = com.jayway.jsonpath.JsonPath.read(
                            result.getResponse().getContentAsString(), "$.logoutUrl");
                    assertTrue(logoutUrl.startsWith("https://zitadel.test/oidc/v1/end_session?"), logoutUrl);
                    assertTrue(logoutUrl.contains("id_token_hint=id-token-2"), logoutUrl);
                    assertTrue(logoutUrl.contains("client_id=beelot-test"), logoutUrl);
                    assertTrue(logoutUrl.contains("post_logout_redirect_uri=http%3A%2F%2Flocalhost%2F"), logoutUrl);
                });
    }

    /** Like the browser client: it reads the token from the cookie and sends it back in a header. */
    @Test
    void aSignedInPlayerMustSendTheCsrfTokenToSignOut() throws Exception {
        MockHttpSession session = new MockHttpSession();
        Cookie token = mockMvc.perform(get("/api/account")).andReturn().getResponse().getCookie("XSRF-TOKEN");

        mockMvc.perform(post("/logout").session(session).cookie(token)).andExpect(status().isForbidden());
        mockMvc.perform(post("/logout").session(session).cookie(token).header("X-XSRF-TOKEN", token.getValue()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logoutUrl").value("/"));
    }

    @Test
    void guestsPlayWithoutACsrfToken() throws Exception {
        mockMvc.perform(post("/api/bot-games").contentType("application/json").content("{\"difficulty\":\"RELAXED\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void theServerGivesTheClientACsrfTokenCookie() throws Exception {
        mockMvc.perform(get("/api/account")).andExpect(cookie().exists("XSRF-TOKEN"));
    }

    private void signIn(OidcUser user) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addPreferredLocale(Locale.FRENCH);
        MockHttpServletResponse response = new MockHttpServletResponse();
        signInSuccessHandler.onAuthenticationSuccess(request, response,
                new OAuth2AuthenticationToken(user, user.getAuthorities(), "zitadel"));
        assertEquals("/", response.getRedirectedUrl());
    }

    private static OidcUser oidcUser(String subject, String tokenValue) {
        OidcIdToken idToken = new OidcIdToken(tokenValue, Instant.now(), Instant.now().plusSeconds(60),
                Map.of("sub", subject));
        return new DefaultOidcUser(AuthorityUtils.createAuthorityList("OIDC_USER"), idToken);
    }
}
