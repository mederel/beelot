package fr.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Signing up and signing in with a passkey from the home screen and the statistics page (US-084). */
class AccountUiTest {

    @Test
    void theHomeScreenOffersPasskeys() throws IOException {
        String html = resource("/static/index.html");
        String app = resource("/static/app.js");

        for (String id : List.of("passkey-sign-in", "passkey-sign-up", "passkey-warning", "passkey-confirm",
                "passkey-unsupported", "stats-sign-in")) {
            assertTrue(html.contains("id=\"" + id + "\""), id);
        }
        for (String call : List.of("\"/api/sign-up/options\"", "\"/api/sign-up\"", "\"/webauthn/authenticate/options\"",
                "\"/login/webauthn\"", "navigator.credentials.create", "navigator.credentials.get",
                "window.PublicKeyCredential")) {
            assertTrue(app.contains(call), call);
        }
    }

    /** No email address, no Google, no GitHub is left in the client (US-084). */
    @Test
    void noEmailOrProviderLeft() throws IOException {
        for (String file : List.of("/static/index.html", "/static/app.js", "/static/i18n.js", "/static/i18n-nl.js")) {
            String text = resource(file);
            for (String gone : List.of("sign-in-email", "/api/sign-in/link", "/login/ott", "email-change",
                    "account.providers", "Continue with {0}", "inbox", "afterSignIn")) {
                assertFalse(text.contains(gone), file + " still contains " + gone);
            }
        }
    }

    /** A deletion that needs a fresh sign-in asks for the passkey on the spot, then shows the confirmation again. */
    @Test
    void deletionSignsInAgainWithThePasskey() throws IOException {
        String app = resource("/static/app.js");

        String reauthenticate = app.substring(app.indexOf("body.reason === \"reauthenticate\""));
        reauthenticate = reauthenticate.substring(0, reauthenticate.indexOf("throw new Error"));
        assertTrue(reauthenticate.contains("signInWithPasskey("), reauthenticate);
        assertTrue(reauthenticate.contains("showDeleteConfirm()"), reauthenticate);
        assertFalse(reauthenticate.contains("openSignInPanel"), reauthenticate);
    }

    @Test
    void thePasskeyTextsAreTranslated() throws IOException {
        List<String> texts = List.of(
                "Sign in with a passkey",
                "Create an account",
                "Your passkey is the only way to sign in. If you lose it, you lose your account: there is no recovery.",
                "I understand, create my passkey",
                "Sign-in did not complete. Please try again.",
                "Your browser does not support passkeys. You can still play as a guest.",
                "Too many attempts. Please try again later.",
                "For your safety, sign in again to delete your account.");

        for (String locale : List.of("/static/i18n.js", "/static/i18n-nl.js")) {
            String dictionary = resource(locale);
            for (String text : texts) {
                assertTrue(dictionary.contains("\"" + text + "\":"), () -> locale + " does not translate: " + text);
            }
        }
    }

    @Test
    void settingsOfferYourData() throws IOException {
        String html = resource("/static/index.html");
        String app = resource("/static/app.js");
        String settings = html.substring(html.indexOf("data-view=\"settings\""));

        for (String id : List.of("your-data", "export-data", "export-message", "delete-account", "delete-confirm",
                "delete-confirm-word", "delete-confirm-button", "delete-message")) {
            assertTrue(settings.contains("id=\"" + id + "\""), id);
        }
        assertTrue(settings.contains(">Download my data<"));
        assertTrue(settings.contains(">Delete my account<"));
        assertTrue(app.contains("fetch(\"/api/account\", withCsrfToken({ method: \"DELETE\""));
        assertTrue(app.contains("fetch(\"/api/account/export\")"));
    }

    @Test
    void yourDataTextsAreTranslated() throws IOException {
        String french = resource("/static/i18n.js");
        String dutch = resource("/static/i18n-nl.js");

        assertTrue(french.contains("\"Download my data\": \"Télécharger mes données\""));
        assertTrue(french.contains("\"Delete my account\": \"Supprimer mon compte\""));
        assertTrue(french.contains("\"DELETE\": \"SUPPRIMER\""));
        assertTrue(dutch.contains("\"Download my data\": \"Mijn gegevens downloaden\""));
        assertTrue(dutch.contains("\"Delete my account\": \"Mijn account verwijderen\""));
        assertTrue(dutch.contains("\"DELETE\": \"VERWIJDEREN\""));
        for (String text : List.of("Your data", "You can download your data again in {0} minutes.",
                "Your account has been deleted.", "For your safety, sign in again to delete your account.",
                "Type this word to confirm:", "Delete my account for good", "Cancel")) {
            assertTrue(french.contains("\"" + text + "\":"), "French: " + text);
            assertTrue(dutch.contains("\"" + text + "\":"), "Dutch: " + text);
        }
    }

    /** The home screen shows the latest other sign-in, so the player can spot an access they did not make (US-077). */
    @Test
    void theHomeScreenShowsTheLastSignIn() throws IOException {
        String html = resource("/static/index.html");
        String app = resource("/static/app.js");

        assertTrue(html.contains("id=\"account-last-sign-in\""));
        assertTrue(app.contains("account.lastSignInAt"));
        for (String locale : List.of("/static/i18n.js", "/static/i18n-nl.js")) {
            String dictionary = resource(locale);
            for (String text : List.of("Last sign-in: {0}", "This is your first sign-in.")) {
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
