package com.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertTrue;

class FrenchTranslationUiTest {

    @Test
    void packagedUiOffersALanguageSettingAndFrenchTranslations() throws IOException {
        String html = resource("/static/index.html");
        String translations = resource("/static/i18n.js");

        assertTrue(html.contains("id=\"language-select\""));
        assertTrue(html.contains("<option value=\"fr\">Français</option>"));
        assertTrue(html.indexOf("/i18n.js") < html.indexOf("/app.js"), "i18n.js must load before app.js");
        assertTrue(translations.contains("\"Deal the cards\": \"Distribuer les cartes\""));
        assertTrue(translations.contains("\"It is not your turn to play.\""));
    }

    private String resource(String path) throws IOException {
        try (var stream = getClass().getResourceAsStream(path)) {
            if (stream == null) throw new AssertionError("Packaged resource is missing: " + path);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
