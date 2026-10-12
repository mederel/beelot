package fr.beelot.application.account;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.authentication.ott.OneTimeToken;
import org.springframework.security.web.authentication.ott.OneTimeTokenGenerationSuccessHandler;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Emails a freshly generated sign-in link to the player. The link is built from the configured public URL, never from
 * the request, and neither the address nor the link is logged.
 */
@Component
public class SignInLinkSender implements OneTimeTokenGenerationSuccessHandler {

    private static final Logger log = LoggerFactory.getLogger(SignInLinkSender.class);

    private final JavaMailSender mail;
    private final JsonMapper json;
    private final String publicUrl;
    private final String from;

    public SignInLinkSender(JavaMailSender mail, JsonMapper json, @Value("${beelot.public-url}") String publicUrl,
                            @Value("${beelot.mail.from}") String from) {
        this.mail = mail;
        this.json = json;
        this.publicUrl = publicUrl.endsWith("/") ? publicUrl.substring(0, publicUrl.length() - 1) : publicUrl;
        this.from = from;
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, OneTimeToken token)
            throws IOException {
        SignInEmail email = SignInEmail.of(SignInEmail.language(request),
                publicUrl + "/sign-in?token=" + token.getTokenValue());
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(token.getUsername());
        message.setSubject(email.subject());
        message.setText(email.body());
        try {
            mail.send(message);
        } catch (MailException failure) {
            log.warn("Could not send a sign-in link: {}", failure.getClass().getName());
            response.setStatus(503);
            response.setContentType("application/json");
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(json.writeValueAsString(
                    Map.of("message", "The email could not be sent. Please try again later.")));
            return;
        }
        response.setStatus(204);
    }
}
