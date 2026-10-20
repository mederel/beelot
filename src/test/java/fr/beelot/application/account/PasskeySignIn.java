package fr.beelot.application.account;

import fr.beelot.application.privacy.AccountSessions;
import fr.beelot.application.privacy.SecurityEvents;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.web.webauthn.api.Bytes;
import org.springframework.security.web.webauthn.api.ImmutablePublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.authentication.WebAuthnAuthentication;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.Instant;
import java.util.UUID;

/**
 * Signs a request in as the account, as a passkey sign-in does (US-084): the security context holds a
 * {@link WebAuthnAuthentication} whose user is named with the account id, and the session holds the account id and
 * the time of the sign-in.
 */
public final class PasskeySignIn {

    private PasskeySignIn() {
    }

    public static RequestPostProcessor as(UUID accountId) {
        return request -> {
            var user = ImmutablePublicKeyCredentialUserEntity.builder()
                    .name(accountId.toString())
                    .id(Bytes.random())
                    .displayName(accountId.toString())
                    .build();
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(new WebAuthnAuthentication(user, AuthorityUtils.createAuthorityList("ROLE_USER")));
            var signedIn = SecurityMockMvcRequestPostProcessors.securityContext(context).postProcessRequest(request);
            HttpSession session = signedIn.getSession();
            session.setAttribute(SecurityEvents.ACCOUNT_ID, accountId);
            session.setAttribute(AccountSessions.SIGNED_IN_AT, Instant.now());
            return signedIn;
        };
    }
}
