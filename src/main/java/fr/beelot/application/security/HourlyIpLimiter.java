package fr.beelot.application.security;

import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Counts what each client IP does within one fixed window of an hour, up to a limit. A refused attempt is not
 * counted. The number of tracked IPs is bounded so the limiter cannot itself be used to exhaust memory: once full,
 * a new IP is refused until a window ends.
 */
public class HourlyIpLimiter {

    private static final int MAX_TRACKED = 50_000;
    private static final Duration WINDOW = Duration.parse("PT1H");

    private final Map<String, Window> byIp = new HashMap<>();
    private final Clock clock;
    private final int limitPerIp;

    public HourlyIpLimiter(Clock clock, int limitPerIp) {
        this.clock = clock;
        this.limitPerIp = limitPerIp;
    }

    /** Whether the IP is within its limit now; when it is, this attempt is counted against it. */
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
