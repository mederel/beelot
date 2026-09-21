package com.beelot.application.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Clock;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limits API requests per client address using fixed windows. Requests that create games or tables
 * (the operations that allocate server memory) have a much lower limit than ordinary API calls.
 * The number of tracked clients is bounded so the limiter cannot itself be used to exhaust memory.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestRateLimitFilter extends OncePerRequestFilter {

    private static final int MAX_TRACKED_CLIENTS = 50_000;

    private final Map<String, Window> general = new ConcurrentHashMap<>();
    private final Map<String, Window> creation = new ConcurrentHashMap<>();
    private final int generalLimit;
    private final int creationLimit;
    private final long windowMillis;
    private final Clock clock;

    public RequestRateLimitFilter() {
        this(300, 20, 60_000, Clock.systemUTC());
    }

    @org.springframework.beans.factory.annotation.Autowired
    public RequestRateLimitFilter(
            @Value("${beelot.security.rate-limit.requests-per-window:300}") int generalLimit,
            @Value("${beelot.security.rate-limit.creations-per-window:20}") int creationLimit,
            @Value("${beelot.security.rate-limit.window-millis:60000}") long windowMillis) {
        this(generalLimit, creationLimit, windowMillis, Clock.systemUTC());
    }

    RequestRateLimitFilter(int generalLimit, int creationLimit, long windowMillis, Clock clock) {
        this.generalLimit = generalLimit;
        this.creationLimit = creationLimit;
        this.windowMillis = windowMillis;
        this.clock = clock;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String client = request.getRemoteAddr();
        long now = clock.millis();
        long retryAfter = Math.max(
                consume(general, client, generalLimit, now),
                isCreation(request) ? consume(creation, client, creationLimit, now) : 0);
        if (retryAfter > 0) {
            response.setStatus(429);
            response.setHeader("Retry-After", Long.toString(retryAfter));
            response.setContentType("application/json");
            response.getWriter().write("{\"message\":\"Too many requests. Please slow down.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private boolean isCreation(HttpServletRequest request) {
        if (!"POST".equals(request.getMethod())) return false;
        String path = request.getRequestURI();
        return path.equals("/api/ai-games") || path.equals("/api/private-tables")
                || path.equals("/api/private-tables/join");
    }

    /** Returns 0 when the request is allowed, otherwise the seconds to wait. */
    private long consume(Map<String, Window> windows, String client, int limit, long now) {
        if (windows.size() >= MAX_TRACKED_CLIENTS && !windows.containsKey(client)) {
            purgeExpired(windows, now);
            if (windows.size() >= MAX_TRACKED_CLIENTS) return windowMillis / 1000 + 1;
        }
        Window window = windows.compute(client, (key, current) ->
                current == null || now - current.start >= windowMillis
                        ? new Window(now, 1)
                        : new Window(current.start, current.count + 1));
        if (window.count <= limit) return 0;
        return Math.max(1, (window.start + windowMillis - now + 999) / 1000);
    }

    private void purgeExpired(Map<String, Window> windows, long now) {
        Iterator<Window> iterator = windows.values().iterator();
        while (iterator.hasNext()) {
            if (now - iterator.next().start >= windowMillis) iterator.remove();
        }
    }

    private record Window(long start, int count) {
    }
}
