package fr.beelot.application.security;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.web.webauthn.api.CredentialRecord;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialCreationOptions;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialRequestOptions;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.management.PublicKeyCredentialCreationOptionsRequest;
import org.springframework.security.web.webauthn.management.PublicKeyCredentialRequestOptionsRequest;
import org.springframework.security.web.webauthn.management.RelyingPartyAuthenticationRequest;
import org.springframework.security.web.webauthn.management.RelyingPartyRegistrationRequest;
import org.springframework.security.web.webauthn.management.UserCredentialRepository;
import org.springframework.security.web.webauthn.management.WebAuthnRelyingPartyOperations;

/**
 * Refuses a sign-in whose signature counter does not go up from the one stored at the last sign-in, a sign that the
 * passkey was cloned. Spring checks the counter only against the one at sign-up. A passkey that always reports 0, as
 * synced passkeys do, passes.
 */
class CounterCheckingRelyingPartyOperations implements WebAuthnRelyingPartyOperations {

    /** The counter follows the 32-byte hash of the relying party id and the 1-byte flags. */
    private static final int COUNTER_OFFSET = 33;

    private final WebAuthnRelyingPartyOperations delegate;
    private final UserCredentialRepository credentials;

    CounterCheckingRelyingPartyOperations(WebAuthnRelyingPartyOperations delegate,
                                          UserCredentialRepository credentials) {
        this.delegate = delegate;
        this.credentials = credentials;
    }

    @Override
    public PublicKeyCredentialCreationOptions createPublicKeyCredentialCreationOptions(
            PublicKeyCredentialCreationOptionsRequest request) {
        return delegate.createPublicKeyCredentialCreationOptions(request);
    }

    @Override
    public CredentialRecord registerCredential(RelyingPartyRegistrationRequest request) {
        return delegate.registerCredential(request);
    }

    @Override
    public PublicKeyCredentialRequestOptions createCredentialRequestOptions(
            PublicKeyCredentialRequestOptionsRequest request) {
        return delegate.createCredentialRequestOptions(request);
    }

    @Override
    public PublicKeyCredentialUserEntity authenticate(RelyingPartyAuthenticationRequest request) {
        CredentialRecord stored = credentials.findByCredentialId(request.getPublicKey().getRawId());
        if (stored != null) {
            long presented = counter(request.getPublicKey().getResponse().getAuthenticatorData().getBytes());
            if (!counterGoesUp(stored.getSignatureCount(), presented)) {
                throw new BadCredentialsException("Signature counter did not increase");
            }
        }
        return delegate.authenticate(request);
    }

    /** Whether a counter is valid after the stored one (WebAuthn §6.1.1): it goes up, or both are 0. */
    static boolean counterGoesUp(long stored, long presented) {
        return (stored == 0 && presented == 0) || presented > stored;
    }

    private static long counter(byte[] authenticatorData) {
        if (authenticatorData.length < COUNTER_OFFSET + 4) {
            throw new BadCredentialsException("Authenticator data too short");
        }
        long counter = 0;
        for (int i = COUNTER_OFFSET; i < COUNTER_OFFSET + 4; i++) {
            counter = (counter << 8) | (authenticatorData[i] & 0xFF);
        }
        return counter;
    }
}
