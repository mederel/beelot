package fr.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class PrivacyPageUiTest {

    private static final Pattern TEXT = Pattern.compile(">([^<]+)<");

    @Test
    void thePolicyIsLinkedFromTheHomeScreenAndTheSignInForm() throws IOException {
        String html = resource("/static/index.html");
        String home = between(html, "data-view=\"home\"", "data-view=\"bot\"");
        String signInForm = between(html, "id=\"sign-in-panel\"", "id=\"account-signed-in\"");

        assertThat(html).contains("data-view=\"privacy\"");
        assertThat(home).contains("href=\"/privacy\"");
        assertThat(signInForm).contains("href=\"/privacy\">How we handle your data</a>");
        for (String id : new String[]{"privacy-controller", "privacy-contact", "privacy-hosting",
                "privacy-backup-days"}) {
            assertThat(html).contains("id=\"" + id + "\"");
        }
        assertThat(resource("/static/app.js")).contains("\"/privacy\": \"privacy\"").contains("/api/privacy/policy-info");
    }

    @Test
    void thePolicyNamesTheCnil() throws IOException {
        assertThat(privacyView()).contains("href=\"https://www.cnil.fr/fr/plaintes\"");
    }

    /** A guest whose sign-in fails leaves a security event with their IP address: the policy must not deny it. */
    @Test
    void thePolicyDoesNotClaimGuestsLeaveNoData() throws IOException {
        assertThat(privacyView()).doesNotContain("keeps nothing about them");
    }

    /** Beelot keeps a passkey's public key, never an email address, and hosting is its only processor (US-084). */
    @Test
    void thePolicyDescribesPasskeysOnly() throws IOException {
        String html = resource("/static/index.html");

        assertThat(privacyView()).contains("passkey").contains("public key")
                .contains("Beelot never asks for your email address")
                .doesNotContain("Google").doesNotContain("GitHub").doesNotContain("email link")
                .doesNotContain("your email address and");
        assertThat(html).doesNotContain("privacy-smtp");
    }

    /** French is the reference text of the policy: every sentence of the page is translated in both languages. */
    @Test
    void everyTextOfThePolicyIsTranslated() throws IOException {
        String french = resource("/static/i18n.js");
        String dutch = resource("/static/i18n-nl.js");
        List<String> texts = texts(privacyView());

        assertThat(texts).hasSizeGreaterThan(20);
        for (String text : texts) {
            assertThat(french).as("French for: " + text).contains("\"" + text + "\":");
            assertThat(dutch).as("Dutch for: " + text).contains("\"" + text + "\":");
        }
    }

    private String privacyView() throws IOException {
        return between(resource("/static/index.html"), "data-view=\"privacy\"", "data-view=\"settings\"");
    }

    private static List<String> texts(String html) {
        List<String> texts = new ArrayList<>();
        Matcher matcher = TEXT.matcher(html);
        while (matcher.find()) {
            String text = matcher.group(1).replaceAll("\\s+", " ").strip();
            if (!text.isEmpty() && !text.startsWith("cnil.fr") && !text.equals("XSRF-TOKEN")) {
                texts.add(text);
            }
        }
        return texts;
    }

    private static String between(String text, String start, String end) {
        int from = text.indexOf(start);
        assertThat(from).as(start).isNotNegative();
        int to = text.indexOf(end, from);
        assertThat(to).as(end).isGreaterThan(from);
        return text.substring(from, to);
    }

    private String resource(String path) throws IOException {
        try (var stream = getClass().getResourceAsStream(path)) {
            if (stream == null) throw new AssertionError("Packaged resource is missing: " + path);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
