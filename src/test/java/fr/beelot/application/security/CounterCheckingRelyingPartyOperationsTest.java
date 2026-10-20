package fr.beelot.application.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mockito;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.web.webauthn.api.AuthenticatorAssertionResponse;
import org.springframework.security.web.webauthn.api.Bytes;
import org.springframework.security.web.webauthn.api.CredentialRecord;
import org.springframework.security.web.webauthn.api.PublicKeyCredential;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.management.RelyingPartyAuthenticationRequest;
import org.springframework.security.web.webauthn.management.UserCredentialRepository;
import org.springframework.security.web.webauthn.management.WebAuthnRelyingPartyOperations;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The signature counter must go up from one sign-in to the next, unless the passkey always reports 0 (US-084). */
class CounterCheckingRelyingPartyOperationsTest {

    private static final Bytes CREDENTIAL_ID = Bytes.random();

    private final WebAuthnRelyingPartyOperations delegate = mock(WebAuthnRelyingPartyOperations.class);
    private final UserCredentialRepository credentials = mock(UserCredentialRepository.class);
    private final CounterCheckingRelyingPartyOperations operations =
            new CounterCheckingRelyingPartyOperations(delegate, credentials);
    private final PublicKeyCredentialUserEntity user = mock(PublicKeyCredentialUserEntity.class);

    CounterCheckingRelyingPartyOperationsTest() {
        when(delegate.authenticate(any())).thenReturn(user);
    }

    @ParameterizedTest(name = "{1} after {0}")
    @CsvSource({"0, 0", "4, 5", "0, 1", "4294967294, 4294967295"})
    void aCounterThatGoesUpOrStaysAtZeroIsAllowed(long stored, long presented) {
        storedCounter(stored);

        assertSame(user, operations.authenticate(request(presented)));
    }

    @ParameterizedTest(name = "{1} after {0}")
    @CsvSource({"4, 4", "4, 3", "4, 0"})
    void aCounterThatDoesNotGoUpIsRefused(long stored, long presented) {
        storedCounter(stored);

        assertThrows(BadCredentialsException.class, () -> operations.authenticate(request(presented)));
        verify(delegate, never()).authenticate(any());
    }

    @Test
    void anUnknownCredentialIsLeftToSpring() {
        RelyingPartyAuthenticationRequest request = request(0);

        assertSame(user, operations.authenticate(request));
        verify(delegate).authenticate(request);
    }

    @Test
    void truncatedAuthenticatorDataIsRefused() {
        storedCounter(0);
        RelyingPartyAuthenticationRequest request = request(new byte[36]);

        assertThrows(BadCredentialsException.class, () -> operations.authenticate(request));
    }

    private void storedCounter(long counter) {
        CredentialRecord record = mock(CredentialRecord.class);
        when(record.getSignatureCount()).thenReturn(counter);
        when(credentials.findByCredentialId(CREDENTIAL_ID)).thenReturn(record);
    }

    /** An assertion whose authenticator data carries the counter after the 32-byte hash and the flags. */
    private static RelyingPartyAuthenticationRequest request(long counter) {
        byte[] data = new byte[37];
        data[32] = 0x05;
        for (int i = 0; i < 4; i++) {
            data[33 + i] = (byte) (counter >>> (8 * (3 - i)));
        }
        return request(data);
    }

    @SuppressWarnings("unchecked")
    private static RelyingPartyAuthenticationRequest request(byte[] authenticatorData) {
        AuthenticatorAssertionResponse response = mock(AuthenticatorAssertionResponse.class);
        when(response.getAuthenticatorData()).thenReturn(new Bytes(authenticatorData));
        PublicKeyCredential<AuthenticatorAssertionResponse> credential = Mockito.mock(PublicKeyCredential.class);
        when(credential.getRawId()).thenReturn(CREDENTIAL_ID);
        when(credential.getResponse()).thenReturn(response);
        RelyingPartyAuthenticationRequest request = mock(RelyingPartyAuthenticationRequest.class);
        when(request.getPublicKey()).thenReturn(credential);
        return request;
    }
}
