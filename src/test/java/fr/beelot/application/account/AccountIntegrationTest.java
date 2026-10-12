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
import java.util.regex.Pattern;

import static fr.beelot.application.account.PseudonymGeneratorTest.withoutNumber;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Signing in end to end, on a MariaDB database migrated by Flyway, with Google and GitHub configured. */
@SpringBootTest(properties = {
        "spring.security.oauth2.client.registration.google.client-id=g",
        "spring.security.oauth2.client.registration.google.client-secret=s",
        "spring.security.oauth2.client.registration.github.client-id=h",
        "spring.security.oauth2.client.registration.github.client-secret=t"})
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
    void aGuestIsOfferedGoogleAndGithub() throws Exception {
        mockMvc.perform(get("/api/account"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signedIn").value(false))
                .andExpect(jsonPath("$.providers[0].id").value("google"))
                .andExpect(jsonPath("$.providers[0].signInUrl").value("/oauth2/authorization/google"))
                .andExpect(jsonPath("$.providers[1].id").value("github"))
                .andExpect(jsonPath("$.name").doesNotExist());
    }

    @Test
    void signingInWithGoogleAsksForTheOpenidScopeOnly() throws Exception {
        mockMvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> {
                    String redirect = result.getResponse().getRedirectedUrl();
                    assertTrue(Pattern.compile("[?&]scope=openid(&|$)").matcher(redirect).find(), redirect);
                });
    }

    @Test
    void theFirstSignInCreatesTheAccountUnderAPseudonym() throws Exception {
        signIn(oidcUser("u-1", "id-token-1"));
        signIn(oidcUser("u-1", "id-token-1"));

        // A second account for the same user would make this lookup fail.
        String name = accounts.findByProviderAndProviderSubject("google", "u-1").orElseThrow().displayName();
        assertTrue(PseudonymGenerator.all(Locale.FRENCH).contains(withoutNumber(name)), name);
        mockMvc.perform(get("/api/account").with(oidcLogin()
                        .idToken(token -> token.subject("u-1"))
                        .clientRegistration(registrations.findByRegistrationId("google"))))
                .andExpect(jsonPath("$.signedIn").value(true))
                .andExpect(jsonPath("$.name").value(name))
                .andExpect(jsonPath("$.providers").doesNotExist());
    }

    /** Even when the server's default locale is French, a browser that sends no language gets English. */
    @Test
    void aSignInWithoutALanguageGetsAnEnglishPseudonym() throws Exception {
        Locale serverDefault = Locale.getDefault();
        Locale.setDefault(Locale.FRENCH);
        try {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.removeHeader("Accept-Language");
            signInSuccessHandler.onAuthenticationSuccess(request, new MockHttpServletResponse(),
                    new OAuth2AuthenticationToken(oidcUser("u-3", "id-token-3"), List.of(), "google"));
        } finally {
            Locale.setDefault(serverDefault);
        }

        String name = accounts.findByProviderAndProviderSubject("google", "u-3").orElseThrow().displayName();
        assertTrue(PseudonymGenerator.all(Locale.ENGLISH).contains(withoutNumber(name)), name);
    }

    /** Like the browser client: it reads the token from the cookie and sends it back in a header. */
    @Test
    void aSignedInPlayerMustSendTheCsrfTokenToSignOut() throws Exception {
        MockHttpSession session = new MockHttpSession();
        Cookie token = mockMvc.perform(get("/api/account")).andReturn().getResponse().getCookie("XSRF-TOKEN");

        mockMvc.perform(post("/logout").session(session).cookie(token)).andExpect(status().isForbidden());
        mockMvc.perform(post("/logout").session(session).cookie(token).header("X-XSRF-TOKEN", token.getValue()))
                .andExpect(status().isNoContent());
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
        request.addHeader("Accept-Language", "fr-FR,fr;q=0.9");
        MockHttpServletResponse response = new MockHttpServletResponse();
        signInSuccessHandler.onAuthenticationSuccess(request, response,
                new OAuth2AuthenticationToken(user, user.getAuthorities(), "google"));
        assertEquals("/", response.getRedirectedUrl());
    }

    private static OidcUser oidcUser(String subject, String tokenValue) {
        OidcIdToken idToken = new OidcIdToken(tokenValue, Instant.now(), Instant.now().plusSeconds(60),
                Map.of("sub", subject));
        return new DefaultOidcUser(AuthorityUtils.createAuthorityList("OIDC_USER"), idToken);
    }
}
