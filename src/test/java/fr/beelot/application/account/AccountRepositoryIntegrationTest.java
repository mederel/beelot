package fr.beelot.application.account;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataIntegrityViolationException;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertThrows;

/** The database lets an email address belong to one account only. */
@SpringBootTest
@Testcontainers
class AccountRepositoryIntegrationTest {

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @Autowired
    private AccountRepository accounts;

    @Autowired
    private AccountEmailRepository emails;

    @Test
    void anEmailBelongsToOneAccount() {
        Account first = accounts.save(Account.withEmail("First", Instant.now()));
        Account second = accounts.save(Account.withEmail("Second", Instant.now()));
        emails.saveAndFlush(new AccountEmail(first.id(), "jane@example.com"));

        assertThrows(DataIntegrityViolationException.class,
                () -> emails.saveAndFlush(new AccountEmail(second.id(), "jane@example.com")));
    }
}
