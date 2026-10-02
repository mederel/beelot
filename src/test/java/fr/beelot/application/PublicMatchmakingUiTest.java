package fr.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertTrue;

class PublicMatchmakingUiTest {

    @Test
    void packagedUiExposesPublicMatchmaking() throws IOException {
        String html = resource("/static/index.html");

        assertTrue(html.contains("href=\"/online/public\""));
        assertTrue(html.contains("data-view=\"public\""));
        assertTrue(html.contains("id=\"quick-match-form\""));
        assertTrue(html.contains("name=\"public-variant\""));
        assertTrue(html.contains("id=\"public-waiting\""));
        assertTrue(html.contains("id=\"leave-table-button\""));
        for (String translations : new String[]{resource("/static/i18n.js"), resource("/static/i18n-nl.js")}) {
            assertTrue(translations.contains("\"Find a game\":"));
            assertTrue(translations.contains("\"Leave table\":"));
            assertTrue(translations.contains("\"Looking for players… bots take the empty seats in {0} s.\":"));
        }
    }

    private String resource(String path) throws IOException {
        try (var stream = getClass().getResourceAsStream(path)) {
            if (stream == null) throw new AssertionError("Packaged resource is missing: " + path);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
