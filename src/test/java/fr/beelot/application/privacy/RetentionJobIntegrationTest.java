package fr.beelot.application.privacy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/** The nightly retention job (US-083) on a MariaDB database migrated by Flyway, at a fixed time. */
@SpringBootTest
@Testcontainers
class RetentionJobIntegrationTest {

    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private static final Instant THREE_YEARS_AGO = NOW.atZone(ZoneOffset.UTC).minusYears(3).toInstant();
    private static final Instant WARNING_AGE = THREE_YEARS_AGO.plus(Duration.ofDays(30));

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private TransactionTemplate transactions;

    @Autowired
    private AccountDeletionService deletion;

    @MockitoBean
    private JavaMailSender mail;

    private RetentionJob job() {
        return new RetentionJob(jdbc, transactions, deletion, mail, Clock.fixed(NOW, ZoneOffset.UTC),
                "Beelot <no-reply@beelot.test>", "https://beelot.test");
    }

    @Test
    void oldEventsArePurged() {
        UUID old = UUID.randomUUID();
        UUID recent = UUID.randomUUID();
        event(old, NOW.minus(Duration.ofDays(366)));
        event(recent, NOW.minus(Duration.ofDays(364)));

        job().run();

        assertThat(count("SELECT COUNT(*) FROM security_event WHERE account_id = ?", old)).isZero();
        assertThat(count("SELECT COUNT(*) FROM security_event WHERE account_id = ?", recent)).isEqualTo(1);
    }

    @Test
    void inactiveEmailAccountIsWarnedOnce() {
        UUID account = emailAccount("warned@example.com", WARNING_AGE, null);

        job().run();
        job().run();

        verify(mail, times(1)).send(sentTo("warned@example.com"));
        assertThat(warnedAt(account)).isEqualTo(NOW);
    }

    @Test
    void theWarningSaysWhenAndWhereToSignIn() {
        emailAccount("text@example.com", WARNING_AGE, null);

        job().run();

        verify(mail).send(argThat((SimpleMailMessage message) -> Arrays.equals(message.getTo(),
                new String[]{"text@example.com"})
                && message.getText().contains("https://beelot.test")
                && message.getText().contains("30")
                && message.getFrom().equals("Beelot <no-reply@beelot.test>")));
    }

    @Test
    void warnedAccountIsDeletedThirtyDaysLater() {
        UUID due = emailAccount("due@example.com", THREE_YEARS_AGO, NOW.minus(Duration.ofDays(30)));
        UUID notYet = emailAccount("notyet@example.com", THREE_YEARS_AGO, NOW.minus(Duration.ofDays(29)));

        job().run();

        assertThat(exists(due)).isFalse();
        assertThat(count("SELECT COUNT(*) FROM account_email WHERE email = ?", "due@example.com")).isZero();
        assertThat(exists(notYet)).isTrue();
    }

    @Test
    void providerAccountIsDeletedWithoutWarning() {
        UUID account = providerAccount(THREE_YEARS_AGO);

        job().run();

        assertThat(exists(account)).isFalse();
    }

    @Test
    void failedWarningIsRetried() {
        UUID account = emailAccount("failing@example.com", WARNING_AGE, null);
        doThrow(new MailSendException("smtp down")).when(mail).send(sentTo("failing@example.com"));

        assertThatCode(() -> job().run()).doesNotThrowAnyException();

        assertThat(warnedAt(account)).isNull();
        assertThat(exists(account)).isTrue();
    }

    @Test
    void activeAccountIsUntouched() {
        UUID email = emailAccount("active@example.com", NOW.minus(Duration.ofDays(365)), null);
        UUID provider = providerAccount(NOW.minus(Duration.ofDays(365)));

        job().run();

        verify(mail, never()).send(sentTo("active@example.com"));
        assertThat(exists(email)).isTrue();
        assertThat(exists(provider)).isTrue();
        assertThat(warnedAt(email)).isNull();
    }

    private static SimpleMailMessage sentTo(String address) {
        return argThat(message -> message != null && Arrays.equals(message.getTo(), new String[]{address}));
    }

    private UUID emailAccount(String email, Instant lastSignIn, Instant warnedAt) {
        UUID id = account("email", lastSignIn, warnedAt);
        jdbc.sql("INSERT INTO account_email (account_id, email) VALUES (?, ?)").params(id.toString(), email).update();
        return id;
    }

    private UUID providerAccount(Instant lastSignIn) {
        return account("google", lastSignIn, null);
    }

    private UUID account(String provider, Instant lastSignIn, Instant warnedAt) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO account (id, provider, provider_subject, display_name, created_at, last_sign_in_at, "
                        + "deletion_warned_at) VALUES (?, ?, ?, 'Old Otter 1', ?, ?, ?)")
                .params(id.toString(), provider, id.toString(), utc(lastSignIn), utc(lastSignIn), utc(warnedAt))
                .update();
        return id;
    }

    private void event(UUID account, Instant at) {
        jdbc.sql("INSERT INTO security_event (account_id, type, outcome, ip_address, occurred_at) "
                + "VALUES (?, 'SIGN_IN', 'SUCCESS', '127.0.0.1', ?)").params(account.toString(), utc(at)).update();
    }

    private boolean exists(UUID account) {
        return count("SELECT COUNT(*) FROM account WHERE id = ?", account) == 1;
    }

    private Instant warnedAt(UUID account) {
        LocalDateTime warned = jdbc.sql("SELECT deletion_warned_at FROM account WHERE id = ?").param(account.toString())
                .query((row, number) -> row.getObject(1, LocalDateTime.class)).list().getFirst();
        return warned == null ? null : warned.toInstant(ZoneOffset.UTC);
    }

    private long count(String sql, Object param) {
        return jdbc.sql(sql).param(param instanceof UUID id ? id.toString() : param).query(Long.class).single();
    }

    private static LocalDateTime utc(Instant instant) {
        return instant == null ? null : LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
