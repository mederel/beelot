package fr.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertTrue;

class ContreeUiTest {

    @Test
    void packagedUiExposesContréeForAiAndPrivateTables() throws IOException {
        String html;
        try (var stream = getClass().getResourceAsStream("/static/index.html")) {
            if (stream == null) throw new AssertionError("Packaged index.html is missing");
            html = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }

        assertTrue(html.contains("value=\"CONTREE\""));
        assertTrue(html.contains("id=\"contract-bid-button\""));
        assertTrue(html.contains("id=\"coinche-button\""));
        assertTrue(html.contains("name=\"private-variant\""));
        assertTrue(html.contains("id=\"private-bid-button\""));
        assertTrue(html.contains("id=\"private-coinche-button\""));
        assertTrue(html.contains("Contrée variant"));
        assertTrue(html.contains("id=\"ai-card-table\""));
        assertTrue(html.contains("id=\"ai-player-left\""));
        assertTrue(html.contains("id=\"ai-player-top\""));
        assertTrue(html.contains("id=\"ai-player-right\""));
        assertTrue(html.contains("id=\"private-card-table\""));
        assertTrue(html.contains("id=\"bidding-card-table\""));
        assertTrue(html.contains("id=\"bidding-player-left\""));
        assertTrue(html.contains("id=\"bidding-player-top\""));
        assertTrue(html.contains("id=\"bidding-player-right\""));
    }
}
