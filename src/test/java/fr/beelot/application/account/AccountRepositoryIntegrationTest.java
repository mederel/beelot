package fr.beelot.application.account;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.util.List;
import java.util.Locale;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** The cleanup job asks in one query which Zitadel users have signed in to Beelot (US-076). */
@SpringBootTest
@Testcontainers
class AccountRepositoryIntegrationTest {

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @Autowired
    private AccountService accountService;

    @Autowired
    private AccountRepository accounts;

    @Test
    void findsWhichUsersHaveSignedIn() {
        accountService.signIn("zitadel", "z-1", Locale.ENGLISH);
        accountService.signIn("other", "z-2", Locale.ENGLISH);

        assertEquals(Set.of("z-1"), accounts.findProviderSubjects("zitadel", List.of("z-1", "z-2", "z-3")));
    }
}
