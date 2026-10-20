package fr.beelot.application.account;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.web.webauthn.api.Bytes;
import org.springframework.security.web.webauthn.api.ImmutablePublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.authentication.WebAuthnAuthentication;
import org.springframework.security.web.webauthn.management.WebAuthnRelyingPartyOperations;
import org.springframework.security.authentication.TestingAuthenticationToken;

import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.SplittableRandom;
import java.util.UUID;

import static fr.beelot.application.account.PseudonymGeneratorTest.withoutNumber;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AccountServiceTest {

    private final AccountRepository repository = Mockito.mock(AccountRepository.class);
    private final AccountService service = new AccountService(repository,
            new PseudonymGenerator(new SplittableRandom(3)), Mockito.mock(WebAuthnRelyingPartyOperations.class));

    AccountServiceTest() {
        when(repository.save(any(Account.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void createMakesAnAccountWithAPseudonymInThePlayersLanguage() {
        Account account = service.create(Locale.FRENCH);

        assertTrue(PseudonymGenerator.all(Locale.FRENCH).contains(withoutNumber(account.displayName())),
                account.displayName());
        verify(repository).save(account);
    }

    @Test
    void aSignInKeepsThePseudonymAndRecordsThePreviousSignIn() {
        Account existing = new Account("Jane", Instant.parse("2020-01-01T00:00:00Z"));
        when(repository.findById(existing.id())).thenReturn(Optional.of(existing));
        Instant before = existing.lastSignInAt();

        assertSame(existing, service.signIn(existing.id()).orElseThrow());

        assertEquals("Jane", existing.displayName());
        assertEquals(before, existing.previousSignInAt());
        assertFalse(existing.lastSignInAt().isBefore(before));
    }

    @Test
    void aSignInToAnUnknownAccountIsEmpty() {
        UUID unknown = UUID.randomUUID();
        when(repository.findById(unknown)).thenReturn(Optional.empty());

        assertTrue(service.signIn(unknown).isEmpty());
    }

    @Test
    void currentFindsAPasskeyAccount() {
        Account existing = new Account("Jane", Instant.parse("2020-01-01T00:00:00Z"));
        when(repository.findById(existing.id())).thenReturn(Optional.of(existing));

        assertSame(existing, service.current(passkey(existing.id().toString())).orElseThrow());
        assertEquals(existing.id(), service.currentId(passkey(existing.id().toString())));
    }

    @Test
    void currentIgnoresANonUuidName() {
        assertTrue(service.current(passkey("not-a-uuid")).isEmpty());
    }

    @Test
    void currentIgnoresAnythingButAPasskey() {
        UUID id = UUID.randomUUID();

        assertTrue(service.current(new TestingAuthenticationToken(id.toString(), "n", "ROLE_USER")).isEmpty());
        assertTrue(service.current(null).isEmpty());
    }

    private static WebAuthnAuthentication passkey(String name) {
        var user = ImmutablePublicKeyCredentialUserEntity.builder().name(name).id(Bytes.random())
                .displayName(name).build();
        return new WebAuthnAuthentication(user, AuthorityUtils.createAuthorityList("ROLE_USER"));
    }
}
