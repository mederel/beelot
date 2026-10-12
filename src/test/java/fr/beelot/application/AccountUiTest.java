package fr.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Signing in with Google or GitHub from the home screen and the statistics page (US-075). */
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

    private String resource(String path) throws IOException {
        try (var stream = getClass().getResourceAsStream(path)) {
            if (stream == null) throw new AssertionError("Packaged resource is missing: " + path);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
