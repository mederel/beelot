package com.beelot.application.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class RequestLimitFiltersTest {

    private MockHttpServletResponse send(RequestRateLimitFilter filter, String method, String uri, String ip)
            throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.setRemoteAddr(ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }

    @Test
    void rejectsRequestsOverThePerClientLimitAndRecoversAfterTheWindow() throws Exception {
        MutableClock clock = new MutableClock();
        RequestRateLimitFilter filter = new RequestRateLimitFilter(3, 1, 60_000, clock);
        for (int i = 0; i < 3; i++) assertThat(send(filter, "GET", "/api/ai-games/x", "1.1.1.1").getStatus()).isEqualTo(200);
        MockHttpServletResponse limited = send(filter, "GET", "/api/ai-games/x", "1.1.1.1");
        assertThat(limited.getStatus()).isEqualTo(429);
        assertThat(limited.getHeader("Retry-After")).isNotNull();
        assertThat(send(filter, "GET", "/api/ai-games/x", "2.2.2.2").getStatus()).isEqualTo(200);
        clock.advance(61_000);
        assertThat(send(filter, "GET", "/api/ai-games/x", "1.1.1.1").getStatus()).isEqualTo(200);
    }

    @Test
    void appliesAStricterLimitToCreatingGamesAndTables() throws Exception {
        RequestRateLimitFilter filter = new RequestRateLimitFilter(100, 2, 60_000, new MutableClock());
        assertThat(send(filter, "POST", "/api/ai-games", "1.1.1.1").getStatus()).isEqualTo(200);
        assertThat(send(filter, "POST", "/api/private-tables", "1.1.1.1").getStatus()).isEqualTo(200);
        assertThat(send(filter, "POST", "/api/private-tables/join", "1.1.1.1").getStatus()).isEqualTo(429);
        assertThat(send(filter, "GET", "/api/private-tables/x", "1.1.1.1").getStatus()).isEqualTo(200);
    }

    @Test
    void ignoresStaticResources() throws Exception {
        RequestRateLimitFilter filter = new RequestRateLimitFilter(1, 1, 60_000, new MutableClock());
        for (int i = 0; i < 5; i++) assertThat(send(filter, "GET", "/app.js", "1.1.1.1").getStatus()).isEqualTo(200);
    }

    @Test
    void rejectsOversizedBodiesByDeclaredLength() throws Exception {
        RequestSizeLimitFilter filter = new RequestSizeLimitFilter(100);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/ai-games");
        request.setContent(new byte[500]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        assertThat(response.getStatus()).isEqualTo(413);
    }

    @Test
    void allowsSmallBodies() throws Exception {
        RequestSizeLimitFilter filter = new RequestSizeLimitFilter(100);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/ai-games");
        request.setContent("{}".getBytes());
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        assertThat(response.getStatus()).isEqualTo(200);
    }

    private static final class MutableClock extends Clock {
        private long millis = 1_000_000;

        void advance(long ms) {
            millis += ms;
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return Instant.ofEpochMilli(millis);
        }

        @Override
        public long millis() {
            return millis;
        }
    }
}
