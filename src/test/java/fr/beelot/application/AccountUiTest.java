package fr.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Signing in with an email link, Google or GitHub from the home screen and the statistics page (US-075). */
class AccountUiTest {

    @Test
    void theHomeScreenAndStatisticsPageOfferEachProvider() throws IOException {
        String html = resource("/static/index.html");
        String app = resource("/static/app.js");

        assertTrue(html.contains("id=\"account-sign-in\""));
        assertTrue(html.contains("id=\"stats-sign-in\""));
        assertTrue(app.contains("account.providers"));
        assertFalse(app.contains("registerUrl"));
        assertFalse(app.contains("logoutUrl"));
        assertTrue(app.contains("signin=failed") || app.contains("\"signin\""));
        assertFalse(app.contains("Sign in with {0}"));
    }

    @Test
    void theSignInTextsAreTranslated() throws IOException {
        String french = resource("/static/i18n.js");
        String dutch = resource("/static/i18n-nl.js");

        assertTrue(french.contains("\"Continue with {0}\": \"Continuer avec {0}\""));
        assertTrue(french.contains("\"Sign-in did not complete. Please try again.\""));
        assertTrue(dutch.contains("\"Continue with {0}\": \"Doorgaan met {0}\""));
        assertTrue(dutch.contains("\"Sign-in did not complete. Please try again.\""));
        assertFalse(french.contains("Sign in with {0}"));
        assertFalse(dutch.contains("Sign in with {0}"));
    }

    @Test
    void playersCanAskForASignInLinkAndConfirmIt() throws IOException {
        String html = resource("/static/index.html");
        String app = resource("/static/app.js");

        assertTrue(html.contains("id=\"sign-in-panel\""));
        assertTrue(html.contains("id=\"sign-in-email\""));
        assertTrue(html.contains("id=\"sign-in-confirm\""));
        assertTrue(app.contains("\"/api/sign-in/link\""));
        assertTrue(app.contains("\"/login/ott\""));
        assertTrue(app.contains("history.replaceState"));
        assertTrue(app.contains("\"/sign-in\": \"sign-in\""));
    }

    @Test
    void theEmailLinkTextsAreTranslated() throws IOException {
        List<String> texts = List.of(
                "Email me a sign-in link",
                "Email address",
                "Check your inbox. If you can't find the email, look in your spam folder. The link works for 15 minutes.",
                "Enter a valid email address.",
                "Too many links requested. Please try again later.",
                "The email could not be sent. Please try again later.",
                "Sign in to Beelot",
                "This link has expired or has already been used.");

        for (String locale : List.of("/static/i18n.js", "/static/i18n-nl.js")) {
            String dictionary = resource(locale);
            for (String text : texts) {
                assertTrue(dictionary.contains("\"" + text + "\":"), () -> locale + " does not translate: " + text);
            }
        }
    }

    private String resource(String path) throws IOException {
        try (var stream = getClass().getResourceAsStream(path)) {
            if (stream == null) throw new AssertionError("Packaged resource is missing: " + path);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
