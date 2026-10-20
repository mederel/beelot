package fr.beelot.application.account;

import fr.beelot.application.privacy.AccountSessions;
import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.privacy.SecurityEvents.Outcome;
import fr.beelot.application.privacy.SecurityEvents.Type;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.webauthn.authentication.WebAuthnAuthentication;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

/**
 * Starts the session of a player who signs in or signs up with a passkey: on a new session id and a new CSRF token,
 * with the account recorded in the session, in the account's sessions and in the security events.
 */
@Component
public class SignInSuccessHandler implements AuthenticationSuccessHandler {

    private final AccountService accounts;
    private final SecurityEvents events;
    private final AccountSessions sessions;
    private final CsrfAuthenticationStrategy csrfRotation;
    private final SecurityContextRepository contexts = new HttpSessionSecurityContextRepository();

    SignInSuccessHandler(AccountService accounts, SecurityEvents events, AccountSessions sessions,
                         CsrfTokenRepository csrfTokens) {
        this.accounts = accounts;
        this.events = events;
        this.sessions = sessions;
        this.csrfRotation = new CsrfAuthenticationStrategy(csrfTokens);
    }

    /** Signs the browser in to the account, and answers 204. */
    public void startSession(HttpServletRequest request, HttpServletResponse response,
                             WebAuthnAuthentication authentication, Account account) {
        renew(request, response, authentication);
        SecurityContextHolderStrategy holder = SecurityContextHolder.getContextHolderStrategy();
        SecurityContext context = holder.createEmptyContext();
        context.setAuthentication(authentication);
        holder.setContext(context);
        contexts.saveContext(context, request, response);
        signedIn(request, response, account);
    }

    /**
     * Finishes a sign-in through Spring Security's {@code /login/webauthn}, which has already saved the security
     * context in the session: records the sign-in to the account, and answers 204.
     */
    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) {
        // Spring's filter keeps the session id and the CSRF token, so they are renewed here.
        renew(request, response, authentication);
        Optional<Account> account = accounts.signIn(UUID.fromString(authentication.getName()));
        if (account.isEmpty()) {
            // Deleted since the passkey was checked: no session for it.
            SecurityContextHolder.getContextHolderStrategy().clearContext();
            request.getSession().invalidate();
            events.record(Type.SIGN_IN, Outcome.FAILURE, null, request.getRemoteAddr());
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        signedIn(request, response, account.get());
    }

    /** A new session id and CSRF token, so that those held before the sign-in do not survive it. */
    private void renew(HttpServletRequest request, HttpServletResponse response, Authentication authentication) {
        request.getSession(true);
        request.changeSessionId();
        csrfRotation.onAuthentication(authentication, request, response);
    }

    private void signedIn(HttpServletRequest request, HttpServletResponse response, Account account) {
        request.getSession().setAttribute(SecurityEvents.ACCOUNT_ID, account.id());
        sessions.signedIn(account.id(), request.getSession());
        events.record(Type.SIGN_IN, Outcome.SUCCESS, account.id(), request.getRemoteAddr());
        response.setStatus(HttpServletResponse.SC_NO_CONTENT);
    }
}
