package fr.beelot.application.account;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * The CSRF token across a change of address (US-079), with the real cookie repository: every request sends the
 * cookie and echoes it in the header, as the browser client does. Spring Security's {@code csrf()} test helper replaces
 * the repository of the shared context, so this class never uses it, and has a context of its own.
 */
@SpringBootTest(properties = {"beelot.sign-in.limit-per-ip=1000", "beelot.sign-in.limit-per-address=4"})
@AutoConfigureMockMvc
@Testcontainers
class EmailChangeCsrfIntegrationTest {

    private static final Pattern SIGN_IN = Pattern.compile("/sign-in\\?token=([A-Za-z0-9_-]{43})");
    private static final Pattern CHANGE = Pattern.compile("/settings/email\\?token=([A-Za-z0-9_-]{43})");

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:12.3");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JavaMailSender mail;

    /** As /login/ott does, signing in by confirming a change replaces a CSRF token the browser held before. */
    @Test
    void confirmingRotatesTheCsrfToken() throws Exception {
        Cookie xsrf = mockMvc.perform(get("/api/account")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertThat(xsrf).isNotNull();
        mockMvc.perform(post("/api/sign-in/link").cookie(xsrf).header("X-XSRF-TOKEN", xsrf.getValue())
                .param("username", "rotate-old@example.com"));
        MvcResult signedIn = mockMvc.perform(post("/login/ott").cookie(xsrf).header("X-XSRF-TOKEN", xsrf.getValue())
                .param("token", lastToken(SIGN_IN))).andReturn();
        assertThat(signedIn.getResponse().getStatus()).isEqualTo(204);
        MockHttpSession session = (MockHttpSession) signedIn.getRequest().getSession(false);
        Cookie current = freshToken(session);
        assertThat(mockMvc.perform(post("/api/account/email").session(session).cookie(current)
                        .header("X-XSRF-TOKEN", current.getValue()).param("email", "rotate-new@example.com"))
                .andReturn().getResponse().getStatus()).isEqualTo(204);

        // A token planted in the browser before the sign-in, as an attacker able to set the cookie would.
        Cookie planted = new Cookie("XSRF-TOKEN", "planted-before-sign-in");
        MockHttpServletResponse confirmed = mockMvc.perform(post("/api/account/email/confirm").cookie(planted)
                .header("X-XSRF-TOKEN", planted.getValue()).param("token", lastToken(CHANGE))).andReturn().getResponse();

        assertThat(confirmed.getStatus()).isEqualTo(204);
        Cookie after = confirmed.getCookie("XSRF-TOKEN");
        assertThat(after).isNotNull();
        assertThat(after.getValue()).isNotEqualTo(planted.getValue());
    }

    private Cookie freshToken(MockHttpSession session) throws Exception {
        return mockMvc.perform(get("/api/account").session(session)).andReturn().getResponse().getCookie("XSRF-TOKEN");
    }

    private String lastToken(Pattern pattern) {
        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail, atLeast(1)).send(captor.capture());
        List<SimpleMailMessage> sent = captor.getAllValues();
        for (int i = sent.size() - 1; i >= 0; i--) {
            Matcher matcher = pattern.matcher(sent.get(i).getText());
            if (matcher.find()) return matcher.group(1);
        }
        throw new AssertionError("No link sent");
    }
}
