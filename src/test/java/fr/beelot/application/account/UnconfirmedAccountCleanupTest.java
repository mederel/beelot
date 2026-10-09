package fr.beelot.application.account;

import fr.beelot.application.security.ZitadelApiException;
import fr.beelot.application.security.ZitadelProperties;
import fr.beelot.application.security.ZitadelUsers;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Deletes, through Zitadel, the users who never confirmed their address and never signed in (US-076). */
class UnconfirmedAccountCleanupTest {

    private static final Instant CUTOFF = Instant.parse("2026-10-01T12:00:00Z");

    private final ZitadelUsers users = Mockito.mock(ZitadelUsers.class);
    private final AccountRepository accounts = Mockito.mock(AccountRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-08T12:00:00Z"), ZoneOffset.UTC);

    private UnconfirmedAccountCleanup cleanup(String apiToken) {
        return new UnconfirmedAccountCleanup(new ZitadelProperties("https://zitadel.test", "", "", apiToken), users,
                accounts, clock, Duration.ofDays(7));
    }

    @Test
    void deletesUnconfirmedUsersWhoNeverSignedIn() {
        when(users.unconfirmedCreatedBefore(CUTOFF)).thenReturn(List.of("u1", "u2", "u3"));
        when(accounts.findProviderSubjects("zitadel", List.of("u1", "u2", "u3"))).thenReturn(Set.of("u2"));

        assertEquals(2, cleanup("api-token").cleanUp());

        verify(users).delete("u1");
        verify(users).delete("u3");
        verify(users, never()).delete("u2");
    }

    @Test
    void aFailedDeleteDoesNotStopTheOthers() {
        when(users.unconfirmedCreatedBefore(CUTOFF)).thenReturn(List.of("u1", "u2"));
        when(accounts.findProviderSubjects(eq("zitadel"), anyCollection())).thenReturn(Set.of());
        doThrow(new ZitadelApiException("DELETE", "/v2/users/u1", 500)).when(users).delete("u1");

        assertEquals(1, cleanup("api-token").cleanUp());

        verify(users).delete("u2");
    }

    @Test
    void neverDeletesAUserWhoHoldsARole() {
        when(users.unconfirmedCreatedBefore(CUTOFF)).thenReturn(List.of("admin", "u1"));
        when(accounts.findProviderSubjects(eq("zitadel"), anyCollection())).thenReturn(Set.of());
        when(users.holdsARole("admin")).thenReturn(true);

        assertEquals(1, cleanup("api-token").cleanUp());

        verify(users, never()).delete("admin");
        verify(users).delete("u1");
    }

    @Test
    void aFailedRoleCheckKeepsTheUser() {
        when(users.unconfirmedCreatedBefore(CUTOFF)).thenReturn(List.of("u1", "u2"));
        when(accounts.findProviderSubjects(eq("zitadel"), anyCollection())).thenReturn(Set.of());
        when(users.holdsARole("u1"))
                .thenThrow(new ZitadelApiException("POST", "/management/v1/users/u1/memberships/_search", 403));

        assertEquals(1, cleanup("api-token").cleanUp());

        verify(users, never()).delete("u1");
        verify(users).delete("u2");
    }

    @Test
    void aFailedListingDeletesNothing() {
        when(users.unconfirmedCreatedBefore(CUTOFF)).thenThrow(new ZitadelApiException("POST", "/v2/users", 401));

        assertEquals(0, cleanup("api-token").cleanUp());

        verify(users, never()).delete(any());
    }

    @Test
    void noCandidatesQueriesNothing() {
        when(users.unconfirmedCreatedBefore(CUTOFF)).thenReturn(List.of());

        assertEquals(0, cleanup("api-token").cleanUp());

        verifyNoInteractions(accounts);
    }

    @Test
    void withoutATokenZitadelIsNotCalled() {
        assertEquals(0, cleanup("").cleanUp());

        verifyNoInteractions(users, accounts);
    }
}
