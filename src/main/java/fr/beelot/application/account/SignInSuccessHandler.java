package fr.beelot.application.account;

import fr.beelot.application.privacy.AccountSessions;
import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.privacy.SecurityEvents.Outcome;
import fr.beelot.application.privacy.SecurityEvents.Type;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/** Records the account on each sign-in: in the session, in the account's sessions and in the security events. */
@Component
public class SignInSuccessHandler {

    private final SecurityEvents events;
    private final AccountSessions sessions;

    SignInSuccessHandler(SecurityEvents events, AccountSessions sessions) {
        this.events = events;
        this.sessions = sessions;
    }

    private void signedIn(HttpServletRequest request, Account account) {
        request.getSession().setAttribute(SecurityEvents.ACCOUNT_ID, account.id());
        sessions.signedIn(account.id(), request.getSession());
        events.record(Type.SIGN_IN, Outcome.SUCCESS, account.id(), request.getRemoteAddr());
    }
}
