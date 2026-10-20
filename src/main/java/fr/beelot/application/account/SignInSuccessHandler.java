package fr.beelot.application.account;

import fr.beelot.application.privacy.AccountSessions;
import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.privacy.SecurityEvents.Outcome;
import fr.beelot.application.privacy.SecurityEvents.Type;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.webauthn.authentication.WebAuthnAuthentication;
import org.springframework.stereotype.Component;

/**
 * Starts the session of a player who signs in or signs up with a passkey: on a new session id and a new CSRF token,
 * with the account recorded in the session, in the account's sessions and in the security events.
 */
@Component
public class SignInSuccessHandler {

    private final SecurityEvents events;
    private final AccountSessions sessions;
    private final CsrfAuthenticationStrategy csrfRotation;
    private final SecurityContextRepository contexts = new HttpSessionSecurityContextRepository();

    SignInSuccessHandler(SecurityEvents events, AccountSessions sessions, CsrfTokenRepository csrfTokens) {
        this.events = events;
        this.sessions = sessions;
        this.csrfRotation = new CsrfAuthenticationStrategy(csrfTokens);
    }

    /** Signs the browser in to the account, and answers 204. */
    public void startSession(HttpServletRequest request, HttpServletResponse response,
                             WebAuthnAuthentication authentication, Account account) {
        // A new session id, so that an id planted before the sign-in does not survive it.
        request.getSession(true);
        request.changeSessionId();
        // Likewise for the CSRF token held before the sign-in.
        csrfRotation.onAuthentication(authentication, request, response);
        SecurityContextHolderStrategy holder = SecurityContextHolder.getContextHolderStrategy();
        SecurityContext context = holder.createEmptyContext();
        context.setAuthentication(authentication);
        holder.setContext(context);
        contexts.saveContext(context, request, response);
        signedIn(request, account);
        response.setStatus(HttpServletResponse.SC_NO_CONTENT);
    }

    private void signedIn(HttpServletRequest request, Account account) {
        request.getSession().setAttribute(SecurityEvents.ACCOUNT_ID, account.id());
        sessions.signedIn(account.id(), request.getSession());
        events.record(Type.SIGN_IN, Outcome.SUCCESS, account.id(), request.getRemoteAddr());
    }
}
