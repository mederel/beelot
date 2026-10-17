package fr.beelot.application.security;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;
import java.io.InputStream;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
        for (int i = 0; i < 3; i++) assertThat(send(filter, "GET", "/api/bot-games/x", "1.1.1.1").getStatus()).isEqualTo(200);
        MockHttpServletResponse limited = send(filter, "GET", "/api/bot-games/x", "1.1.1.1");
        assertThat(limited.getStatus()).isEqualTo(429);
        assertThat(limited.getHeader("Retry-After")).isNotNull();
        assertThat(send(filter, "GET", "/api/bot-games/x", "2.2.2.2").getStatus()).isEqualTo(200);
        clock.advance(61_000);
        assertThat(send(filter, "GET", "/api/bot-games/x", "1.1.1.1").getStatus()).isEqualTo(200);
    }

    @Test
    void appliesAStricterLimitToCreatingGamesAndTables() throws Exception {
        RequestRateLimitFilter filter = new RequestRateLimitFilter(100, 2, 60_000, new MutableClock());
        assertThat(send(filter, "POST", "/api/bot-games", "1.1.1.1").getStatus()).isEqualTo(200);
        assertThat(send(filter, "POST", "/api/private-tables", "1.1.1.1").getStatus()).isEqualTo(200);
        assertThat(send(filter, "POST", "/api/private-tables/join", "1.1.1.1").getStatus()).isEqualTo(429);
        assertThat(send(filter, "GET", "/api/private-tables/x", "1.1.1.1").getStatus()).isEqualTo(200);
    }

    @Test
    void countsQuickMatchAsCreatingATable() throws Exception {
        RequestRateLimitFilter filter = new RequestRateLimitFilter(100, 1, 60_000, new MutableClock());
        assertThat(send(filter, "POST", "/api/matchmaking/quick-match", "1.1.1.1").getStatus()).isEqualTo(200);
        assertThat(send(filter, "POST", "/api/matchmaking/quick-match", "1.1.1.1").getStatus()).isEqualTo(429);
    }

    @Test
    void ignoresStaticResources() throws Exception {
        RequestRateLimitFilter filter = new RequestRateLimitFilter(1, 1, 60_000, new MutableClock());
        for (int i = 0; i < 5; i++) assertThat(send(filter, "GET", "/app.js", "1.1.1.1").getStatus()).isEqualTo(200);
    }

    @Test
    void rejectsOversizedBodiesByDeclaredLength() throws Exception {
        RequestSizeLimitFilter filter = new RequestSizeLimitFilter(100);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/bot-games");
        request.setContent(new byte[500]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        assertThat(response.getStatus()).isEqualTo(413);
    }

    @Test
    void allowsSmallBodies() throws Exception {
        RequestSizeLimitFilter filter = new RequestSizeLimitFilter(100);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/bot-games");
        request.setContent("{}".getBytes());
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void tracksABoundedNumberOfClientsAndFreesExpiredOnes() throws Exception {
        MutableClock clock = new MutableClock();
        RequestRateLimitFilter filter = new RequestRateLimitFilter(300, 20, 60_000, clock);
        for (int client = 0; client < 50_000; client++) {
            send(filter, "GET", "/api/statistics", "10." + (client >> 16) + "." + ((client >> 8) & 255) + "." + (client & 255));
        }

        MockHttpServletResponse newcomer = send(filter, "GET", "/api/statistics", "192.168.0.1");
        assertThat(newcomer.getStatus()).isEqualTo(429);
        assertThat(newcomer.getHeader("Retry-After")).isEqualTo("61");
        assertThat(send(filter, "GET", "/api/statistics", "10.0.0.1").getStatus()).isEqualTo(200);

        clock.advance(60_000);
        assertThat(send(filter, "GET", "/api/statistics", "192.168.0.1").getStatus()).isEqualTo(200);
    }

    @Test
    void stopsReadingABodyWithoutADeclaredLengthOnceItIsTooLarge() throws Exception {
        assertThatThrownBy(() -> readUndeclaredBody(new byte[101], body -> body.readAllBytes().length))
                .isInstanceOf(IOException.class).hasMessage("Request body too large");
        assertThatThrownBy(() -> readUndeclaredBody(new byte[101], RequestLimitFiltersTest::readByteByByte))
                .isInstanceOf(IOException.class).hasMessage("Request body too large");
    }

    @Test
    void readsABodyWithoutADeclaredLengthUpToTheLimit() throws Exception {
        assertThat(readUndeclaredBody(new byte[100], body -> body.readAllBytes().length)).isEqualTo(100);
        assertThat(readUndeclaredBody(new byte[100], RequestLimitFiltersTest::readByteByByte)).isEqualTo(100);
    }

    private interface BodyReader {
        int read(InputStream body) throws IOException;
    }

    /** Sends a chunked body, which declares no length, through a 100-byte limit; returns the bytes the app read. */
    private static int readUndeclaredBody(byte[] body, BodyReader reader) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/bot-games") {
            @Override
            public long getContentLengthLong() {
                return -1;
            }
        };
        request.setContent(body);
        int[] read = {0};
        FilterChain app = (servletRequest, servletResponse) -> {
            var stream = servletRequest.getInputStream();
            read[0] = reader.read(stream);
            assertThat(stream.isFinished()).isTrue();
        };
        new RequestSizeLimitFilter(100).doFilter(request, new MockHttpServletResponse(), app);
        return read[0];
    }

    private static int readByteByByte(InputStream body) throws IOException {
        int count = 0;
        while (body.read() >= 0) count++;
        return count;
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
