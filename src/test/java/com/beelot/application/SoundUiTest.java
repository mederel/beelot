package com.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertTrue;

class SoundUiTest {

    @Test
    void packagedUiLoadsSoundEffectsBeforeTheApplication() throws IOException {
        String html = resource("/static/index.html");
        String sounds = resource("/static/sounds.js");

        assertTrue(html.contains("id=\"sound-enabled\""));
        assertTrue(html.indexOf("/sounds.js") < html.indexOf("/app.js"), "sounds.js must load before app.js");
        assertTrue(sounds.contains("beelot.sound-enabled"), "sounds must honour the Sound effects setting");
        assertTrue(sounds.contains("function playSound("));
    }

    private String resource(String path) throws IOException {
        try (var stream = getClass().getResourceAsStream(path)) {
            if (stream == null) throw new AssertionError("Packaged resource is missing: " + path);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
