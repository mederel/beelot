package fr.beelot.application.account;

import org.junit.jupiter.api.Test;
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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AccountServiceTest {

    private final AccountRepository repository = Mockito.mock(AccountRepository.class);
    private final AccountService service = new AccountService(repository,
            new PseudonymGenerator(new SplittableRandom(3)));

    AccountServiceTest() {
        when(repository.save(any(Account.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void theFirstSignInCreatesAnAccountWithAPseudonym() {
        when(repository.findByProviderAndProviderSubject("zitadel", "u-1")).thenReturn(Optional.empty());

        Account account = service.signIn("zitadel", "u-1", Locale.FRENCH);

        assertTrue(PseudonymGenerator.all(Locale.FRENCH).contains(withoutNumber(account.displayName())),
                account.displayName());
        verify(repository).save(account);
    }

    @Test
    void aLaterSignInKeepsThePseudonymWhateverTheLanguage() {
        when(repository.findByProviderAndProviderSubject("zitadel", "u-1")).thenReturn(Optional.empty());
        Account existing = service.signIn("zitadel", "u-1", Locale.ENGLISH);
        when(repository.findByProviderAndProviderSubject("zitadel", "u-1")).thenReturn(Optional.of(existing));
        String name = existing.displayName();
        Instant before = existing.lastSignInAt();

        assertSame(existing, service.signIn("zitadel", "u-1", Locale.of("nl")));

        assertEquals(name, existing.displayName());
        assertFalse(existing.lastSignInAt().isBefore(before));
    }
}
