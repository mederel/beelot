package com.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NoMenusUiTest {

    @Test
    void choicesAreButtonsRatherThanDropdownMenus() throws IOException {
        String html;
        try (var stream = getClass().getResourceAsStream("/static/index.html")) {
            if (stream == null) throw new AssertionError("Packaged index.html is missing");
            html = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }

        assertFalse(html.contains("<select"), "dropdown menus should be replaced by choice buttons");
        for (String group : new String[]{"contract-value", "contract-suit", "private-contract-value",
                "private-contract-suit", "private-variant", "turn-timer", "language"}) {
            assertTrue(html.contains("name=\"" + group + "\" type=\"radio\""), "missing choice group " + group);
        }
    }
}
