package fr.beelot.application.account;

import fr.beelot.application.account.EmailChangeService.Confirmed;
import fr.beelot.application.account.EmailChangeService.InvalidAddress;
import fr.beelot.application.account.EmailChangeService.MailFailed;
import fr.beelot.application.account.EmailChangeService.RateLimited;
import fr.beelot.application.account.EmailChangeService.SameAddress;
import fr.beelot.application.account.EmailChangeService.Sent;
import fr.beelot.application.privacy.AccountSessions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Changing the address of an email account (US-079) on a MariaDB database migrated by Flyway. The mail server is
 * replaced by a mock that captures the emails. The per-IP limit is raised: every request here comes from one address.
 */
@SpringBootTest(properties = "beelot.sign-in.limit-per-ip=1000")
@Testcontainers
class EmailChangeServiceIntegrationTest {

    private static final Pattern TOKEN = Pattern.compile("/settings/email\\?token=([A-Za-z0-9_-]{43})");
    private static final String IP = "203.0.113.7";

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @Autowired
    private EmailChangeService changes;

    @Autowired
    private AccountService accounts;

    @Autowired
    private AccountSessions sessions;

    @Autowired
    private JdbcClient jdbc;

    @MockitoBean
    private JavaMailSender mail;

    @BeforeEach
    void clearMail() {
        clearInvocations(mail);
    }

    @Test
    void aFreeAddressReceivesALinkAndNothingChangesYet() {
        UUID account = account("free-old@example.com");

        assertThat(changes.request(account, "free-new@example.com", Locale.ENGLISH, IP)).isInstanceOf(Sent.class);

        SimpleMailMessage sent = lastMail();
        assertThat(sent.getTo()).containsExactly("free-new@example.com");
        String token = token(sent);
        List<String> hashes = jdbc.sql("SELECT token_hash FROM email_change_token WHERE account_id = ?")
                .param(account.toString()).query(String.class).list();
        assertThat(hashes).containsExactly(Tokens.hash(token));
        assertThat(hashes.getFirst()).isNotEqualTo(token);
        assertThat(emailOf(account)).isEqualTo("free-old@example.com");
        assertThat(events(account, "EMAIL_CHANGE_REQUESTED")).isEqualTo(1);
    }

    @Test
    void confirmingMovesTheAccountAndNotifiesTheOldAddress() {
        UUID account = account("move-old@example.com");
        changes.request(account, "move-new@example.com", Locale.ENGLISH, IP);
        String token = token(lastMail());

        assertThat(changes.confirm(token, Locale.ENGLISH, IP))
                .contains(new Confirmed(account, "move-new@example.com"));

        assertThat(emailOf(account)).isEqualTo("move-new@example.com");
        SimpleMailMessage notice = lastMail();
        assertThat(notice.getTo()).containsExactly("move-old@example.com");
        assertThat(notice.getSubject()).isEqualTo("Your Beelot address was changed");
        assertThat(events(account, "EMAIL_CHANGED")).isEqualTo(1);
        assertThat(pending(account)).isZero();
    }

    @Test
    void confirmingEndsEverySessionOfTheAccount() {
        UUID account = account("sessions-old@example.com");
        MockHttpSession session = new MockHttpSession();
        sessions.signedIn(account, session);
        changes.request(account, "sessions-new@example.com", Locale.ENGLISH, IP);

        changes.confirm(token(lastMail()), Locale.ENGLISH, IP);

        assertThat(session.isInvalid()).isTrue();
    }

    @Test
    void aTakenAddressReceivesANoticeAndNoToken() {
        UUID account = account("taken-old@example.com");
        account("taken-other@example.com");

        assertThat(changes.request(account, "taken-other@example.com", Locale.ENGLISH, IP)).isInstanceOf(Sent.class);

        SimpleMailMessage sent = lastMail();
        assertThat(sent.getTo()).containsExactly("taken-other@example.com");
        assertThat(sent.getSubject()).isEqualTo("This address already has a Beelot account");
        assertThat(pending(account)).isZero();
        assertThat(emailOf(account)).isEqualTo("taken-old@example.com");
    }

    @Test
    void theCurrentAddressIsRefused() {
        UUID account = account("same@example.com");

        assertThat(changes.request(account, "  SAME@Example.com ", Locale.ENGLISH, IP))
                .isInstanceOf(SameAddress.class);
        verify(mail, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void anInvalidAddressIsRefused() {
        UUID account = account("invalid@example.com");

        assertThat(changes.request(account, "not-an-address", Locale.ENGLISH, IP))
                .isInstanceOf(InvalidAddress.class);
        verify(mail, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void theRateLimitApplies() {
        UUID account = account("limit-old@example.com");
        for (int i = 0; i < 3; i++) {
            assertThat(changes.request(account, "limit-new@example.com", Locale.ENGLISH, IP))
                    .isInstanceOf(Sent.class);
        }

        assertThat(changes.request(account, "limit-new@example.com", Locale.ENGLISH, IP))
                .isInstanceOf(RateLimited.class);
        assertThat(events(account, "RATE_LIMITED")).isEqualTo(1);
    }

    /** A link that does not work is logged, as a failed sign-in is, so that guessing shows in the security log. */
    @Test
    void aFailedConfirmationIsRecorded() {
        String ip = "198.51.100.79";

        assertThat(changes.confirm("unknown-token", Locale.ENGLISH, ip)).isEmpty();

        assertThat(jdbc.sql("SELECT COUNT(*) FROM security_event WHERE ip_address = ? AND type = 'EMAIL_CHANGED' "
                + "AND outcome = 'FAILURE' AND account_id IS NULL").param(ip).query(Long.class).single()).isEqualTo(1);
    }

    /** The notice to the old address is a courtesy: the change it reports has been made, so it stands. */
    @Test
    void theChangeStandsWhenTheOldAddressCannotBeTold() {
        UUID account = account("unreachable-old@example.com");
        MockHttpSession session = new MockHttpSession();
        sessions.signedIn(account, session);
        changes.request(account, "unreachable-new@example.com", Locale.ENGLISH, IP);
        String token = token(lastMail());
        doThrow(new MailSendException("down")).when(mail).send(any(SimpleMailMessage.class));

        assertThat(changes.confirm(token, Locale.ENGLISH, IP))
                .contains(new Confirmed(account, "unreachable-new@example.com"));

        assertThat(emailOf(account)).isEqualTo("unreachable-new@example.com");
        assertThat(session.isInvalid()).isTrue();
        assertThat(events(account, "EMAIL_CHANGED")).isEqualTo(1);
    }

    @Test
    void aMissingOrBlankTokenIsRefusedAndRecorded() {
        String ip = "198.51.100.80";

        assertThat(changes.confirm(null, Locale.ENGLISH, ip)).isEmpty();
        assertThat(changes.confirm("  ", Locale.ENGLISH, ip)).isEmpty();

        assertThat(jdbc.sql("SELECT COUNT(*) FROM security_event WHERE ip_address = ? AND type = 'EMAIL_CHANGED' "
                + "AND outcome = 'FAILURE'").param(ip).query(Long.class).single()).isEqualTo(2);
    }

    @Test
    void aSecondRequestReplacesTheFirstLink() {
        UUID account = account("twice-old@example.com");
        changes.request(account, "twice-first@example.com", Locale.ENGLISH, IP);
        String first = token(lastMail());
        changes.request(account, "twice-second@example.com", Locale.ENGLISH, IP);
        String second = token(lastMail());

        assertThat(changes.confirm(first, Locale.ENGLISH, IP)).isEmpty();
        assertThat(changes.confirm(second, Locale.ENGLISH, IP))
                .contains(new Confirmed(account, "twice-second@example.com"));
    }

    @Test
    void requestsMadeAtOnceLeaveOnePendingChange() throws Exception {
        UUID account = account("race-old@example.com");
        int requests = 8;
        CountDownLatch start = new CountDownLatch(1);
        List<Future<EmailChangeService.RequestResult>> results = new ArrayList<>();
        try (ExecutorService pool = Executors.newFixedThreadPool(requests)) {
            for (int index = 0; index < requests; index++) {
                String address = "race-new-" + index + "@example.com";
                results.add(pool.submit(() -> {
                    start.await();
                    return changes.request(account, address, Locale.ENGLISH, IP);
                }));
            }
            start.countDown();
            for (Future<EmailChangeService.RequestResult> result : results) {
                assertThat(result.get(30, TimeUnit.SECONDS)).isInstanceOf(Sent.class);
            }
        }

        assertThat(pending(account)).isEqualTo(1);
    }

    @Test
    void aTokenWorksOnce() {
        UUID account = account("once-old@example.com");
        changes.request(account, "once-new@example.com", Locale.ENGLISH, IP);
        String token = token(lastMail());

        assertThat(changes.confirm(token, Locale.ENGLISH, IP)).isPresent();
        assertThat(changes.confirm(token, Locale.ENGLISH, IP)).isEmpty();
    }

    @Test
    void anExpiredTokenIsRefused() {
        UUID account = account("expired-old@example.com");
        changes.request(account, "expired-new@example.com", Locale.ENGLISH, IP);
        String token = token(lastMail());
        jdbc.sql("UPDATE email_change_token SET expires_at = ? WHERE account_id = ?")
                .params(LocalDateTime.now(ZoneOffset.UTC).minusSeconds(1), account.toString()).update();

        assertThat(changes.confirm(token, Locale.ENGLISH, IP)).isEmpty();
        assertThat(emailOf(account)).isEqualTo("expired-old@example.com");
    }

    @Test
    void anAddressTakenSinceTheRequestIsRefused() {
        UUID account = account("race-old@example.com");
        changes.request(account, "race-new@example.com", Locale.ENGLISH, IP);
        String token = token(lastMail());
        account("race-new@example.com");
        clearInvocations(mail);

        assertThat(changes.confirm(token, Locale.ENGLISH, IP)).isEmpty();

        assertThat(emailOf(account)).isEqualTo("race-old@example.com");
        verify(mail, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void deletingTheAccountRemovesThePendingChange() {
        UUID account = account("deleted-old@example.com");
        changes.request(account, "deleted-new@example.com", Locale.ENGLISH, IP);
        String token = token(lastMail());

        jdbc.sql("DELETE FROM account WHERE id = ?").param(account.toString()).update();

        assertThat(pending(account)).isZero();
        assertThat(changes.confirm(token, Locale.ENGLISH, IP)).isEmpty();
    }

    @Test
    void aMailFailureKeepsNoToken() {
        UUID account = account("down-old@example.com");
        doThrow(new MailSendException("down")).when(mail).send(any(SimpleMailMessage.class));

        assertThat(changes.request(account, "down-new@example.com", Locale.ENGLISH, IP))
                .isInstanceOf(MailFailed.class);
        assertThat(pending(account)).isZero();
    }

    @Test
    void purgeRemovesTokensExpiredForADay() {
        UUID account = account("purge-old@example.com");
        changes.request(account, "purge-new@example.com", Locale.ENGLISH, IP);
        jdbc.sql("UPDATE email_change_token SET expires_at = ? WHERE account_id = ?")
                .params(LocalDateTime.now(ZoneOffset.UTC).minusDays(1).minusMinutes(1), account.toString()).update();

        assertThat(changes.purgeExpired()).isGreaterThanOrEqualTo(1);
        assertThat(pending(account)).isZero();
    }

    private UUID account(String email) {
        return accounts.signInWithEmail(email, Locale.ENGLISH).id();
    }

    private SimpleMailMessage lastMail() {
        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail, atLeast(1)).send(captor.capture());
        return captor.getValue();
    }

    private static String token(SimpleMailMessage message) {
        Matcher matcher = TOKEN.matcher(message.getText());
        assertThat(matcher.find()).isTrue();
        return matcher.group(1);
    }

    private String emailOf(UUID account) {
        return jdbc.sql("SELECT email FROM account_email WHERE account_id = ?").param(account.toString())
                .query(String.class).single();
    }

    private long pending(UUID account) {
        return jdbc.sql("SELECT COUNT(*) FROM email_change_token WHERE account_id = ?").param(account.toString())
                .query(Long.class).single();
    }

    private long events(UUID account, String type) {
        return jdbc.sql("SELECT COUNT(*) FROM security_event WHERE account_id = ? AND type = ?")
                .params(account.toString(), type).query(Long.class).single();
    }
}
