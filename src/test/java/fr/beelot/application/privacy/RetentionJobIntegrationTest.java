package fr.beelot.application.privacy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The nightly retention job (US-083) on a MariaDB database migrated by Flyway, at a fixed time. */
@SpringBootTest
@Testcontainers
class RetentionJobIntegrationTest {

    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private static final Instant THREE_YEARS_AGO = NOW.atZone(ZoneOffset.UTC).minusYears(3).toInstant();

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:12.3");

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private AccountDeletionService deletion;

    private RetentionJob job() {
        return new RetentionJob(jdbc, deletion, Clock.fixed(NOW, ZoneOffset.UTC));
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
    void deletesAccountsInactiveFor3Years() {
        UUID account = account(THREE_YEARS_AGO);

        job().run();

        assertThat(exists(account)).isFalse();
    }

    @Test
    void keepsAccountsSignedInWithin3Years() {
        UUID account = account(THREE_YEARS_AGO.plus(Duration.ofDays(1)));

        job().run();

        assertThat(exists(account)).isTrue();
    }

    @Test
    void deletesAccountsInactiveFor3YearsWithTheirPasskey() {
        UUID account = account(THREE_YEARS_AGO);
        String userHandle = userEntity(account.toString(), THREE_YEARS_AGO);

        job().run();

        assertThat(exists(account)).isFalse();
        assertThat(count("SELECT COUNT(*) FROM user_entities WHERE id = ?", userHandle)).isZero();
        assertThat(count("SELECT COUNT(*) FROM user_credentials WHERE user_entity_user_id = ?", userHandle)).isZero();
    }

    @Test
    void purgesOrphanUserEntities() {
        String abandoned = userEntity(UUID.randomUUID().toString(), NOW.minus(Duration.ofDays(2)));
        String inProgress = userEntity(UUID.randomUUID().toString(), NOW.minus(Duration.ofHours(1)));
        UUID account = account(NOW);
        String withAccount = userEntity(account.toString(), NOW.minus(Duration.ofDays(2)));

        job().run();

        assertThat(count("SELECT COUNT(*) FROM user_entities WHERE id = ?", abandoned)).isZero();
        assertThat(count("SELECT COUNT(*) FROM user_entities WHERE id = ?", inProgress)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM user_entities WHERE id = ?", withAccount)).isEqualTo(1);
    }

    /** A WebAuthn user entity named after the account id, with one passkey; returns its user handle. */
    private String userEntity(String name, Instant createdAt) {
        String handle = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO user_entities (id, name, display_name, created_at) VALUES (?, ?, 'Old Otter 1', ?)")
                .params(handle, name, utc(createdAt)).update();
        jdbc.sql("INSERT INTO user_credentials (credential_id, user_entity_user_id, public_key, backup_eligible, "
                        + "backup_state, label) VALUES (?, ?, X'00', FALSE, FALSE, 'Beelot')")
                .params(UUID.randomUUID().toString(), handle).update();
        return handle;
    }

    private UUID account(Instant lastSignIn) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO account (id, display_name, created_at, last_sign_in_at) VALUES (?, 'Old Otter 1', ?, ?)")
                .params(id.toString(), utc(lastSignIn), utc(lastSignIn)).update();
        return id;
    }

    private void event(UUID account, Instant at) {
        jdbc.sql("INSERT INTO security_event (account_id, type, outcome, ip_address, occurred_at) "
                + "VALUES (?, 'SIGN_IN', 'SUCCESS', '127.0.0.1', ?)").params(account.toString(), utc(at)).update();
    }

    private boolean exists(UUID account) {
        return count("SELECT COUNT(*) FROM account WHERE id = ?", account) == 1;
    }

    private long count(String sql, Object param) {
        return jdbc.sql(sql).param(param instanceof UUID id ? id.toString() : param).query(Long.class).single();
    }

    private static LocalDateTime utc(Instant instant) {
        return instant == null ? null : LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
