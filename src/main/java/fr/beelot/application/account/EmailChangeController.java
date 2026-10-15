package fr.beelot.application.account;

import fr.beelot.application.account.EmailChangeService.Confirmed;
import fr.beelot.application.privacy.AccountSessions;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.ott.OneTimeTokenAuthentication;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.time.Clock;
import java.util.Map;
import java.util.Optional;

/**
 * Changing the address of an email account (US-079): asking for a change needs a recent sign-in, and confirming it
 * signs this browser in with the new address, the account's other sessions having ended.
 */
@RestController
class EmailChangeController {

    private final AccountService accounts;
    private final EmailChangeService changes;
    private final SignInSuccessHandler signInSuccess;
    private final Clock clock;
    private final SecurityContextRepository contexts = new HttpSessionSecurityContextRepository();

    EmailChangeController(AccountService accounts, EmailChangeService changes, SignInSuccessHandler signInSuccess,
                          Clock clock) {
        this.accounts = accounts;
        this.changes = changes;
        this.signInSuccess = signInSuccess;
        this.clock = clock;
    }

    @PostMapping("/api/account/email")
    ResponseEntity<?> request(@RequestParam(name = "email", required = false) String email,
                              Authentication authentication, HttpServletRequest request) {
        Optional<Account> account = accounts.current(authentication);
        if (account.isEmpty()) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (accounts.email(account.get().id()).isEmpty()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of());
        }
        HttpSession session = request.getSession(false);
        if (session == null || !AccountSessions.signedInRecently(session, clock)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("reason", "reauthenticate"));
        }
        return switch (changes.request(account.get().id(), email, SignInEmail.language(request),
                request.getRemoteAddr())) {
            case EmailChangeService.Sent sent -> ResponseEntity.noContent().build();
            case EmailChangeService.InvalidAddress invalid -> message(HttpStatus.BAD_REQUEST,
                    "Enter a valid email address.");
            case EmailChangeService.SameAddress same -> message(HttpStatus.BAD_REQUEST,
                    "This is already your address.");
            case EmailChangeService.RateLimited limited -> message(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many links requested. Please try again later.");
            case EmailChangeService.MailFailed failed -> message(HttpStatus.SERVICE_UNAVAILABLE,
                    "The email could not be sent. Please try again later.");
        };
    }

    @PostMapping("/api/account/email/confirm")
    ResponseEntity<?> confirm(@RequestParam(name = "token", required = false) String token,
                              HttpServletRequest request, HttpServletResponse response)
            throws IOException, ServletException {
        Optional<Confirmed> confirmed = changes.confirm(token, SignInEmail.language(request), request.getRemoteAddr());
        if (confirmed.isEmpty()) return message(HttpStatus.BAD_REQUEST, "This link no longer works.");
        // The account's sessions have ended, this one too if it was one of them: sign in on a fresh session id.
        request.getSession(true);
        request.changeSessionId();
        UserDetails user = new EmailUserDetailsService().loadUserByUsername(confirmed.get().newEmail());
        Authentication authentication = new OneTimeTokenAuthentication(user, user.getAuthorities());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        signInSuccess.onAuthenticationSuccess(request, response, authentication);
        return null;
    }

    private static ResponseEntity<Map<String, String>> message(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("message", message));
    }
}
