package fr.beelot.application.account;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Limits sign-in link requests per email address and per client IP using fixed windows. A refused request consumes from
 * neither counter. The number of tracked keys is bounded so the limiter cannot itself be used to exhaust memory.
 */
@Component
public class SignInRateLimiter {

    private static final int MAX_TRACKED = 50_000;
    private static final Duration ADDRESS_WINDOW = Duration.parse("PT15M");
    private static final Duration IP_WINDOW = Duration.parse("PT1H");

    private final Map<String, Window> byAddress = new HashMap<>();
    private final Map<String, Window> byIp = new HashMap<>();
    private final Clock clock;
    private final int limitPerAddress;
    private final int limitPerIp;

    public SignInRateLimiter(
            Clock clock,
            @Value("${beelot.sign-in.limit-per-address}") int limitPerAddress,
            @Value("${beelot.sign-in.limit-per-ip}") int limitPerIp) {
        this.clock = clock;
        this.limitPerAddress = limitPerAddress;
        this.limitPerIp = limitPerIp;
    }

    /** Whether a link may be requested now; when it may, the request is counted against both limits. */
    public synchronized boolean tryAcquire(String email, String ip) {
        long now = clock.millis();
        if (!hasRoom(byAddress, email, limitPerAddress, ADDRESS_WINDOW.toMillis(), now)
                || !hasRoom(byIp, ip, limitPerIp, IP_WINDOW.toMillis(), now)) {
            return false;
        }
        count(byAddress, email, ADDRESS_WINDOW.toMillis(), now);
        count(byIp, ip, IP_WINDOW.toMillis(), now);
        return true;
    }

    private boolean hasRoom(Map<String, Window> windows, String key, int limit, long windowMillis, long now) {
        Window window = windows.get(key);
        if (window != null && now - window.start < windowMillis) return window.count < limit;
        if (window == null && windows.size() >= MAX_TRACKED) {
            windows.values().removeIf(w -> now - w.start >= windowMillis);
            return windows.size() < MAX_TRACKED;
        }
        return limit > 0;
    }

    private void count(Map<String, Window> windows, String key, long windowMillis, long now) {
        windows.compute(key, (k, current) -> current == null || now - current.start >= windowMillis
                ? new Window(now, 1)
                : new Window(current.start, current.count + 1));
    }

    private record Window(long start, int count) {
    }
}
