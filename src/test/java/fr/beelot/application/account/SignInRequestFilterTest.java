package fr.beelot.application.account;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;

import static org.assertj.core.api.Assertions.assertThat;

class SignInRequestFilterTest {

    private final SignInRateLimiter limiter = new SignInRateLimiter(Clock.systemUTC(), 3, 10);
    private final SignInRequestFilter filter = new SignInRequestFilter(limiter, JsonMapper.builder().build());

    @Test
    void passesOnTheNormalisedAddress() throws Exception {
        MockHttpServletRequest request = linkRequest(" Jane@Example.COM ");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        HttpServletRequest passed = (HttpServletRequest) chain.getRequest();
        assertThat(passed).isNotNull();
        assertThat(passed.getParameter("username")).isEqualTo("jane@example.com");
        assertThat(passed.getParameterValues("username")).containsExactly("jane@example.com");
        assertThat(passed.getParameterMap().get("username")).containsExactly("jane@example.com");
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void rejectsAnInvalidAddress() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(linkRequest("jane"), response, chain);

        assertThat(chain.getRequest()).isNull();
        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getContentAsString()).isEqualTo("{\"message\":\"Enter a valid email address.\"}");
        assertThat(response.getContentType()).startsWith("application/json");
    }

    @Test
    void rejectsAMissingAddress() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(linkRequest(null), response, chain);

        assertThat(chain.getRequest()).isNull();
        assertThat(response.getStatus()).isEqualTo(400);
    }

    @Test
    void limitsRequestsForTheSameAddressWhateverItsSpelling() throws Exception {
        String[] spellings = {"jane@example.com", " Jane@Example.COM ", "JANE@example.com"};
        for (String spelling : spellings) {
            MockFilterChain chain = new MockFilterChain();
            filter.doFilter(linkRequest(spelling), new MockHttpServletResponse(), chain);
            assertThat(chain.getRequest()).isNotNull();
        }
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(linkRequest("jane@example.com"), response, chain);

        assertThat(chain.getRequest()).isNull();
        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getContentAsString())
                .isEqualTo("{\"message\":\"Too many links requested. Please try again later.\"}");
        assertThat(response.getContentType()).startsWith("application/json");
    }

    @Test
    void leavesOtherRequestsUntouched() throws Exception {
        MockHttpServletRequest get = new MockHttpServletRequest("GET", "/api/sign-in/link");
        MockHttpServletRequest other = new MockHttpServletRequest("POST", "/api/other");
        other.setParameter("username", "jane");
        for (MockHttpServletRequest request : new MockHttpServletRequest[]{get, other}) {
            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();

            filter.doFilter(request, response, chain);

            assertThat(chain.getRequest()).isSameAs(request);
            assertThat(response.getStatus()).isEqualTo(200);
        }
    }

    private static MockHttpServletRequest linkRequest(String username) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/sign-in/link");
        request.setRemoteAddr("203.0.113.7");
        if (username != null) request.setParameter("username", username);
        return request;
    }
}
