package com.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertTrue;

class DutchTranslationUiTest {

    @Test
    void packagedUiOffersDutchAndLoadsItBeforeTheTranslationEngine() throws IOException {
        String html = resource("/static/index.html");
        String dutch = resource("/static/i18n-nl.js");

        assertTrue(html.contains("<input name=\"language\" type=\"radio\" value=\"nl\"><span>Nederlands</span>"));
        assertTrue(html.indexOf("/i18n-nl.js") < html.indexOf("/i18n.js"), "i18n-nl.js must load before i18n.js");
        assertTrue(dutch.contains("\"Deal the cards\": \"Deel de kaarten uit\""));
        assertTrue(dutch.contains("\"It is not your turn to play.\""));
    }

    private String resource(String path) throws IOException {
        try (var stream = getClass().getResourceAsStream(path)) {
            if (stream == null) throw new AssertionError("Packaged resource is missing: " + path);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
