package fr.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Signing in and creating an account through Zitadel from the home screen and the statistics page (US-075). */
class AccountUiTest {

    @Test
    void theHomeScreenAndStatisticsPageOfferToSignInOrCreateAnAccount() throws IOException {
        String html = resource("/static/index.html");
        String app = resource("/static/app.js");

        assertTrue(html.contains("id=\"account-sign-in\""));
        assertTrue(html.contains("id=\"stats-sign-in\""));
        assertTrue(app.contains("account.signInUrl"));
        assertTrue(app.contains("account.registerUrl"));
        assertTrue(app.contains("logoutUrl"));
        assertTrue(app.contains("signin=failed") || app.contains("\"signin\""));
        assertFalse(app.contains("Sign in with {0}"));
    }

    @Test
    void theSignInTextsAreTranslated() throws IOException {
        String french = resource("/static/i18n.js");
        String dutch = resource("/static/i18n-nl.js");

        assertTrue(french.contains("\"Create an account\": \"Créer un compte\""));
        assertTrue(french.contains("\"Sign in\": \"Se connecter\""));
        assertTrue(french.contains("\"Sign-in did not complete. Please try again.\""));
        assertTrue(dutch.contains("\"Create an account\": \"Account aanmaken\""));
        assertTrue(dutch.contains("\"Sign in\": \"Inloggen\""));
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
