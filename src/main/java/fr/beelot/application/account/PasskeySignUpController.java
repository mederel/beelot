package fr.beelot.application.account;

import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.privacy.SecurityEvents.Outcome;
import fr.beelot.application.privacy.SecurityEvents.Type;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.web.webauthn.api.Bytes;
import org.springframework.security.web.webauthn.api.ImmutablePublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialCreationOptions;
import org.springframework.security.web.webauthn.authentication.WebAuthnAuthentication;
import org.springframework.security.web.webauthn.management.ImmutablePublicKeyCredentialCreationOptionsRequest;
import org.springframework.security.web.webauthn.management.PublicKeyCredentialUserEntityRepository;
import org.springframework.security.web.webauthn.management.RelyingPartyPublicKey;
import org.springframework.security.web.webauthn.management.WebAuthnRelyingPartyOperations;
import org.springframework.security.web.webauthn.registration.HttpSessionPublicKeyCredentialCreationOptionsRepository;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.UUID;

/**
 * Signing up with a passkey (US-084). The options name a new account id and a pseudonym in the player's language; the
 * browser creates the passkey for them, and Beelot verifies it, creates the account and signs the browser in. A
 * sign-up that is cancelled or fails creates no account.
 */
@RestController
class PasskeySignUpController {

    private static final Logger LOG = LoggerFactory.getLogger(PasskeySignUpController.class);

    private final AccountService accounts;
    private final PseudonymGenerator pseudonyms;
    private final PublicKeyCredentialUserEntityRepository userEntities;
    private final WebAuthnRelyingPartyOperations relyingParty;
    private final SignInSuccessHandler signIn;
    private final SecurityEvents events;
    private final JsonMapper json;
    private final HttpSessionPublicKeyCredentialCreationOptionsRepository creationOptions =
            new HttpSessionPublicKeyCredentialCreationOptionsRepository();

    PasskeySignUpController(AccountService accounts, PseudonymGenerator pseudonyms,
                            PublicKeyCredentialUserEntityRepository userEntities,
                            WebAuthnRelyingPartyOperations relyingParty, SignInSuccessHandler signIn,
                            SecurityEvents events, @Qualifier("webAuthnJson") JsonMapper json) {
        this.accounts = accounts;
        this.pseudonyms = pseudonyms;
        this.userEntities = userEntities;
        this.relyingParty = relyingParty;
        this.signIn = signIn;
        this.events = events;
        this.json = json;
        // Apart from the options of Spring's own registration endpoint, so that those never sign anyone up.
        creationOptions.setAttrName("beelot.signUpOptions");
    }

    @PostMapping("/api/sign-up/options")
    ResponseEntity<String> options(HttpServletRequest request, HttpServletResponse response) {
        UUID accountId = UUID.randomUUID();
        // Saved first, so that Spring finds this user, with its pseudonym, rather than making one named by the id.
        userEntities.save(ImmutablePublicKeyCredentialUserEntity.builder()
                .name(accountId.toString())
                .id(Bytes.random())
                .displayName(pseudonyms.generate(PseudonymGenerator.language(request)))
                .build());
        PublicKeyCredentialCreationOptions options = relyingParty.createPublicKeyCredentialCreationOptions(
                new ImmutablePublicKeyCredentialCreationOptionsRequest(
                        UsernamePasswordAuthenticationToken.authenticated(accountId.toString(), null, List.of())));
        creationOptions.save(request, response, options);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(json.writeValueAsString(options));
    }

    @PostMapping("/api/sign-up")
    ResponseEntity<Void> signUp(@RequestBody String body, HttpServletRequest request, HttpServletResponse response) {
        PublicKeyCredentialCreationOptions options = creationOptions.load(request);
        if (options == null) return refused(request);
        // Each challenge is answered at most once, whatever the answer.
        creationOptions.save(request, response, null);
        Account account;
        try {
            account = accounts.register(options, json.readValue(body, RelyingPartyPublicKey.class));
        } catch (RuntimeException invalidPasskey) {
            // The class only: the message may quote the credential.
            LOG.debug("Sign-up refused: {}", invalidPasskey.getClass().getName());
            return refused(request);
        }
        events.record(Type.SIGN_UP, Outcome.SUCCESS, account.id(), request.getRemoteAddr());
        signIn.startSession(request, response,
                new WebAuthnAuthentication(options.getUser(), AuthorityUtils.createAuthorityList("ROLE_USER")),
                account);
        return ResponseEntity.noContent().build();
    }

    private ResponseEntity<Void> refused(HttpServletRequest request) {
        events.record(Type.SIGN_UP, Outcome.FAILURE, null, request.getRemoteAddr());
        return ResponseEntity.badRequest().build();
    }
}
