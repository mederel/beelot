package fr.beelot.application.account;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Limits the passkey ceremonies a client IP may start, using one fixed window of an hour. A refused request is not
 * counted. The number of tracked IPs is bounded so the limiter cannot itself be used to exhaust memory.
 */
@Component
public class PasskeyRateLimiter {

    private static final int MAX_TRACKED = 50_000;
    private static final Duration WINDOW = Duration.parse("PT1H");

    private final Map<String, Window> byIp = new HashMap<>();
    private final Clock clock;
    private final int limitPerIp;

    public PasskeyRateLimiter(Clock clock, @Value("${beelot.passkey.limit-per-ip}") int limitPerIp) {
        this.clock = clock;
        this.limitPerIp = limitPerIp;
    }

    /** Whether a ceremony may be started now; when it may, it is counted against the IP's limit. */
    public synchronized boolean tryAcquire(String ip) {
        long now = clock.millis();
        long windowMillis = WINDOW.toMillis();
        if (!hasRoom(ip, windowMillis, now)) return false;
        byIp.compute(ip, (k, current) -> current == null || now - current.start >= windowMillis
                ? new Window(now, 1)
                : new Window(current.start, current.count + 1));
        return true;
    }

    private boolean hasRoom(String ip, long windowMillis, long now) {
        Window window = byIp.get(ip);
        if (window != null && now - window.start < windowMillis) return window.count < limitPerIp;
        if (window == null && byIp.size() >= MAX_TRACKED) {
            byIp.values().removeIf(w -> now - w.start >= windowMillis);
            return byIp.size() < MAX_TRACKED;
        }
        return limitPerIp > 0;
    }

    private record Window(long start, int count) {
    }
}
