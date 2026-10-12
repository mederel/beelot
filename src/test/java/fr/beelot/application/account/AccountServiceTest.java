package fr.beelot.application.account;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.SplittableRandom;

import static fr.beelot.application.account.PseudonymGeneratorTest.withoutNumber;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AccountServiceTest {

    private final AccountRepository repository = Mockito.mock(AccountRepository.class);
    private final AccountEmailRepository emails = Mockito.mock(AccountEmailRepository.class);
    private final AccountService service = new AccountService(repository, emails,
            new PseudonymGenerator(new SplittableRandom(3)));

    AccountServiceTest() {
        when(repository.save(any(Account.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void theFirstSignInCreatesAnAccountWithAPseudonym() {
        when(repository.findByProviderAndProviderSubject("google", "u-1")).thenReturn(Optional.empty());

        Account account = service.signIn("google", "u-1", Locale.FRENCH);

        assertTrue(PseudonymGenerator.all(Locale.FRENCH).contains(withoutNumber(account.displayName())),
                account.displayName());
        verify(repository).save(account);
    }

    @Test
    void aLaterSignInKeepsThePseudonymWhateverTheLanguage() {
        when(repository.findByProviderAndProviderSubject("google", "u-1")).thenReturn(Optional.empty());
        Account existing = service.signIn("google", "u-1", Locale.ENGLISH);
        when(repository.findByProviderAndProviderSubject("google", "u-1")).thenReturn(Optional.of(existing));
        String name = existing.displayName();
        Instant before = existing.lastSignInAt();

        assertSame(existing, service.signIn("google", "u-1", Locale.of("nl")));

        assertEquals(name, existing.displayName());
        assertFalse(existing.lastSignInAt().isBefore(before));
    }

    @Test
    void theFirstLinkSignInCreatesAnEmailAccount() {
        when(emails.findByEmail("jane@example.com")).thenReturn(Optional.empty());

        Account account = service.signInWithEmail("jane@example.com", Locale.FRENCH);

        assertEquals("email", account.provider());
        assertEquals(account.id().toString(), account.providerSubject());
        assertTrue(PseudonymGenerator.all(Locale.FRENCH).contains(withoutNumber(account.displayName())),
                account.displayName());
        verify(repository).save(account);
        ArgumentCaptor<AccountEmail> saved = ArgumentCaptor.forClass(AccountEmail.class);
        verify(emails).save(saved.capture());
        assertEquals("jane@example.com", saved.getValue().email());
        assertEquals(account.id(), saved.getValue().accountId());
    }

    @Test
    void aLaterLinkSignInFindsTheSameAccount() {
        when(emails.findByEmail("jane@example.com")).thenReturn(Optional.empty());
        Account existing = service.signInWithEmail("jane@example.com", Locale.ENGLISH);
        when(emails.findByEmail("jane@example.com"))
                .thenReturn(Optional.of(new AccountEmail(existing.id(), "jane@example.com")));
        when(repository.findById(existing.id())).thenReturn(Optional.of(existing));
        Instant before = existing.lastSignInAt();

        assertSame(existing, service.signInWithEmail("jane@example.com", Locale.FRENCH));

        verify(repository, times(1)).save(any(Account.class));
        assertFalse(existing.lastSignInAt().isBefore(before));
    }
}
