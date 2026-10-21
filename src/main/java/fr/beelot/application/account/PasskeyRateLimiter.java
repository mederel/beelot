package fr.beelot.application.account;

import fr.beelot.application.security.HourlyIpLimiter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;

/** Limits the passkey ceremonies a client IP may start in an hour (US-084). */
@Component
public class PasskeyRateLimiter extends HourlyIpLimiter {

    public PasskeyRateLimiter(Clock clock, @Value("${beelot.passkey.limit-per-ip}") int limitPerIp) {
        super(clock, limitPerIp);
    }
}
