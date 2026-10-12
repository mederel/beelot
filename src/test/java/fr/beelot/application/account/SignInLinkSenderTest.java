package fr.beelot.application.account;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.ott.DefaultOneTimeToken;
import org.springframework.security.authentication.ott.OneTimeToken;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

@ExtendWith(OutputCaptureExtension.class)
class SignInLinkSenderTest {

    private static final String FROM = "Beelot <no-reply@beelot.fr>";

    private final JavaMailSender mail = mock(JavaMailSender.class);
    private final OneTimeToken token = new DefaultOneTimeToken("TOKEN", "jane@example.com", Instant.now().plusSeconds(900));

    private SignInLinkSender sender(String publicUrl) {
        return new SignInLinkSender(mail, JsonMapper.builder().build(), publicUrl, FROM);
    }

    @Test
    void theLinkUsesThePublicUrlWhateverTheHost() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Host", "evil.example");
        request.setServerName("evil.example");
        MockHttpServletResponse response = new MockHttpServletResponse();

        sender("https://beelot.fr/").handle(request, response, token);

        SimpleMailMessage sent = sent();
        assertThat(sent.getText()).contains("https://beelot.fr/sign-in?token=TOKEN").doesNotContain("evil");
        assertThat(response.getStatus()).isEqualTo(204);
    }

    @Test
    void sendsFromTheConfiguredAddressToThePlayer() throws Exception {
        sender("https://beelot.fr").handle(new MockHttpServletRequest(), new MockHttpServletResponse(), token);

        SimpleMailMessage sent = sent();
        assertThat(sent.getFrom()).isEqualTo(FROM);
        assertThat(sent.getTo()).containsExactly("jane@example.com");
        assertThat(sent.getSubject()).isEqualTo("Your Beelot sign-in link");
    }

    @Test
    void anSmtpFailureAnswers503WithoutTheAddress(CapturedOutput output) throws Exception {
        doThrow(new MailSendException("jane@example.com refused")).when(mail).send(any(SimpleMailMessage.class));
        MockHttpServletResponse response = new MockHttpServletResponse();

        sender("https://beelot.fr").handle(new MockHttpServletRequest(), response, token);

        assertThat(response.getStatus()).isEqualTo(503);
        assertThat(response.getContentAsString())
                .isEqualTo("{\"message\":\"The email could not be sent. Please try again later.\"}");
        assertThat(output.getAll()).contains("Could not send a sign-in link").doesNotContain("jane").doesNotContain("TOKEN");
    }

    private SimpleMailMessage sent() {
        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(captor.capture());
        return captor.getValue();
    }
}
