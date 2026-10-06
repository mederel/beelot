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
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Signing in end to end, on a MariaDB database migrated by Flyway, with a GitHub client configured. */
@SpringBootTest(properties = {
        "spring.security.oauth2.client.registration.github.client-id=test-client",
        "spring.security.oauth2.client.registration.github.client-secret=test-secret"})
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
    void aGuestIsOfferedTheConfiguredProviders() throws Exception {
        mockMvc.perform(get("/api/account"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signedIn").value(false))
                .andExpect(jsonPath("$.providers.length()").value(1))
                .andExpect(jsonPath("$.providers[0].id").value("github"))
                .andExpect(jsonPath("$.providers[0].name").value("GitHub"))
                .andExpect(jsonPath("$.providers[0].signInUrl").value("/oauth2/authorization/github"));
    }

    @Test
    void signingInStartsTheProvidersAuthorisationFlow() throws Exception {
        mockMvc.perform(get("/oauth2/authorization/github"))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> assertTrue(result.getResponse().getRedirectedUrl()
                        .startsWith("https://github.com/login/oauth/authorize?")));
    }

    @Test
    void theFirstSignInCreatesTheAccountAndLaterOnesFindIt() throws Exception {
        OAuth2User ana = gitHubUser(1001, "Ana Martin");
        signIn(ana);
        signIn(gitHubUser(1001, "Ana M."));

        assertEquals(1, accounts.findAll().stream().filter(account -> account.provider().equals("github")
                && account.displayName().equals("Ana M.")).count());
        mockMvc.perform(get("/api/account").with(oauth2Login().oauth2User(ana)
                        .clientRegistration(registrations.findByRegistrationId("github"))))
                .andExpect(jsonPath("$.signedIn").value(true))
                .andExpect(jsonPath("$.name").value("Ana M."))
                .andExpect(jsonPath("$.provider").value("github"));
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

    private void signIn(OAuth2User user) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        signInSuccessHandler.onAuthenticationSuccess(new MockHttpServletRequest(), response,
                new OAuth2AuthenticationToken(user, user.getAuthorities(), "github"));
        assertEquals("/", response.getRedirectedUrl());
    }

    private static OAuth2User gitHubUser(int id, String name) {
        return new DefaultOAuth2User(AuthorityUtils.createAuthorityList("OAUTH2_USER"),
                Map.of("id", id, "login", "ana", "name", name), "id");
    }
}
