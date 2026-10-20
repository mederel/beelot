package fr.beelot.application.account;

import fr.beelot.application.privacy.AccountSessions;
import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.privacy.SecurityEvents.Outcome;
import fr.beelot.application.privacy.SecurityEvents.Type;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.webauthn.api.Bytes;
import org.springframework.security.web.webauthn.api.ImmutablePublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.authentication.WebAuthnAuthentication;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The end of a sign-in through Spring Security's {@code /login/webauthn} (US-084). */
class SignInSuccessHandlerTest {

    private final AccountService accounts = Mockito.mock(AccountService.class);
    private final SecurityEvents events = Mockito.mock(SecurityEvents.class);
    private final SignInSuccessHandler handler = new SignInSuccessHandler(accounts, events,
            new AccountSessions(Clock.systemUTC()), CookieCsrfTokenRepository.withHttpOnlyFalse());
    private final UUID accountId = UUID.randomUUID();
    private final MockHttpServletRequest request = new MockHttpServletRequest("POST", "/login/webauthn");
    private final MockHttpServletResponse response = new MockHttpServletResponse();

    SignInSuccessHandlerTest() {
        request.setCookies(new Cookie("XSRF-TOKEN", "before-sign-in"));
        request.getSession(true);
    }

    @Test
    void signInRenewsTheSessionAndTheCsrfTokenAndRecordsTheSignIn() {
        Account account = new Account(accountId, "Pseudo", Instant.now());
        when(accounts.signIn(accountId)).thenReturn(Optional.of(account));
        String before = request.getSession().getId();

        handler.onAuthenticationSuccess(request, response, authentication());

        assertEquals(204, response.getStatus());
        assertNotEquals(before, request.getSession().getId());
        Cookie token = response.getCookie("XSRF-TOKEN");
        assertNotNull(token);
        assertNotEquals("before-sign-in", token.getValue());
        assertEquals(accountId, request.getSession().getAttribute(SecurityEvents.ACCOUNT_ID));
        assertNotNull(request.getSession().getAttribute(AccountSessions.SIGNED_IN_AT));
        verify(accounts).signIn(accountId);
        verify(events).record(Type.SIGN_IN, Outcome.SUCCESS, accountId, request.getRemoteAddr());
    }

    @Test
    void anAccountDeletedMeanwhileIsNotSignedIn() {
        when(accounts.signIn(accountId)).thenReturn(Optional.empty());
        var session = request.getSession();

        handler.onAuthenticationSuccess(request, response, authentication());

        assertEquals(401, response.getStatus());
        assertTrue(((MockHttpSession) session).isInvalid());
        assertNull(request.getSession(false));
        verify(events).record(Type.SIGN_IN, Outcome.FAILURE, null, request.getRemoteAddr());
    }

    private WebAuthnAuthentication authentication() {
        return new WebAuthnAuthentication(ImmutablePublicKeyCredentialUserEntity.builder()
                .name(accountId.toString()).id(Bytes.random()).displayName("Pseudo").build(),
                AuthorityUtils.createAuthorityList("ROLE_USER"));
    }
}
