package fr.beelot.application.account;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class SignInRateLimiterTest {

    private final MutableClock clock = new MutableClock();
    private final SignInRateLimiter limiter = new SignInRateLimiter(clock, 3, 10);

    @Test
    void refusesTheFourthRequestForOneAddressUntilTheWindowEnds() {
        for (int i = 0; i < 3; i++) assertThat(limiter.tryAcquire("a@b.fr", "10.0.0." + i)).isTrue();
        assertThat(limiter.tryAcquire("a@b.fr", "10.0.0.9")).isFalse();

        clock.advance(Duration.ofMinutes(15));

        assertThat(limiter.tryAcquire("a@b.fr", "10.0.0.9")).isTrue();
    }

    @Test
    void refusesTheEleventhRequestFromOneIpAcrossAddresses() {
        for (int i = 0; i < 10; i++) assertThat(limiter.tryAcquire("user" + i + "@b.fr", "10.0.0.1")).isTrue();
        assertThat(limiter.tryAcquire("another@b.fr", "10.0.0.1")).isFalse();

        clock.advance(Duration.ofHours(1));

        assertThat(limiter.tryAcquire("another@b.fr", "10.0.0.1")).isTrue();
    }

    @Test
    void aRefusedRequestConsumesFromNeitherCounter() {
        for (int i = 0; i < 3; i++) limiter.tryAcquire("a@b.fr", "10.0.0.1");
        // Refused by the address limit: must not use up the IP's allowance of 10 (3 used so far).
        for (int i = 0; i < 20; i++) assertThat(limiter.tryAcquire("a@b.fr", "10.0.0.1")).isFalse();

        for (int i = 0; i < 7; i++) assertThat(limiter.tryAcquire("other" + i + "@b.fr", "10.0.0.1")).isTrue();
        assertThat(limiter.tryAcquire("last@b.fr", "10.0.0.1")).isFalse();
    }

    @Test
    void aRefusedRequestDoesNotConsumeTheAddressWhenTheIpIsFull() {
        for (int i = 0; i < 10; i++) limiter.tryAcquire("user" + i + "@b.fr", "10.0.0.1");
        for (int i = 0; i < 5; i++) assertThat(limiter.tryAcquire("fresh@b.fr", "10.0.0.1")).isFalse();

        for (int i = 0; i < 3; i++) assertThat(limiter.tryAcquire("fresh@b.fr", "10.0.0.2")).isTrue();
        assertThat(limiter.tryAcquire("fresh@b.fr", "10.0.0.2")).isFalse();
    }

    @Test
    void tracksABoundedNumberOfAddressesAndFreesExpiredOnes() {
        SignInRateLimiter generous = new SignInRateLimiter(clock, 3, 100_000);
        for (int i = 0; i < 50_000; i++) assertThat(generous.tryAcquire("user" + i + "@b.fr", "10.0.0.1")).isTrue();

        assertThat(generous.tryAcquire("newcomer@b.fr", "10.0.0.1")).isFalse();
        assertThat(generous.tryAcquire("user0@b.fr", "10.0.0.1")).isTrue();

        clock.advance(Duration.ofMinutes(15));

        assertThat(generous.tryAcquire("newcomer@b.fr", "10.0.0.1")).isTrue();
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-01-01T00:00:00Z");

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
