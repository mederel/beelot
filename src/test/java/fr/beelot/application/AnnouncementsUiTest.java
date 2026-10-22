package fr.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/** Declaring, revealing and scoring announcements in the web client (US-060). */
class AnnouncementsUiTest {

    static final String RULES = "Declare tierce (three cards in a row, 20), cinquante (four, 50), cent (five or more, "
            + "100) and carrés (jacks 200, nines 150, aces, tens, kings or queens 100) when you play your first card. "
            + "Sequences follow 7, 8, 9, 10, jack, queen, king, ace in one suit; a card counts once, carrés first. "
            + "Only the team with the best announcement scores, and it scores all of its own: the higher value wins, "
            + "then the longer run, then the higher card, then trump, then whoever declared first. Belote and "
            + "announcements count towards the contract.";

    @Test
    void setupOffersTheOption() throws IOException {
        String html = resource("/static/index.html");
        String app = resource("/static/app.js");

        for (String markup : List.of("name=\"announcements\"", "name=\"local-announcements\"",
                "id=\"announcement-settings\"", "name=\"table-announcements\"", "id=\"announcements-summary\"")) {
            assertTrue(html.contains(markup), markup);
        }
        assertTrue(app.contains("announcements: form.get(\"announcements\") !== \"off\""));
        assertTrue(app.contains("announcements: form.get(\"local-announcements\") !== \"off\""));
        assertTrue(app.contains("/announcements`"));
    }

    @Test
    void cardPlaySendsDeclare() throws IOException {
        String html = resource("/static/index.html");
        String app = resource("/static/app.js");

        assertTrue(html.contains("id=\"declare-announcements\""));
        assertTrue(html.contains("id=\"private-declare-announcements\""));
        assertTrue(app.contains("JSON.stringify({ rank: card.rank, suit: card.suit, declare"));
        assertTrue(app.contains("privateAction(\"cards\", { rank: card.rank, suit: card.suit, declare"));
    }

    @Test
    void revealAndBreakdown() throws IOException {
        String html = resource("/static/index.html");
        String app = resource("/static/app.js");

        for (String id : List.of("announcements-panel", "private-announcements-panel", "declarers-note",
                "private-declarers-note", "declare-option", "private-declare-option")) {
            assertTrue(html.contains("id=\"" + id + "\""), id);
        }
        for (String field : List.of("revealedAnnouncements", "ownAnnouncements", "declarers",
                "northSouthAnnouncements", "\"Announcements: none.\"")) {
            assertTrue(app.contains(field), field);
        }
    }

    @Test
    void rulesExplainAnnouncements() throws IOException {
        String html = resource("/static/index.html");
        String rules = html.substring(html.indexOf("data-view=\"rules\""));

        assertTrue(rules.contains("<h2>Announcements</h2>"));
        assertTrue(rules.contains(RULES));
    }

    @Test
    void everyNewTextIsTranslated() throws IOException {
        List<String> texts = List.of("Announcements", "On", "Off", "Declare: {0}", "{0} declares.",
                "{0} score {1} points of announcements.", "Announcements are on.", "Announcements are off.",
                "Tierce to the {0}", "Cinquante to the {0}", "Cent to the {0}", "Carré of {0}", "jacks", "nines",
                "aces", "tens", "kings", "queens", "Announcements: {0} {1} ({2}).",
                "Announcements: {0} {1} ({2}), which go to {3}.", "tierce", "cinquante", "cent",
                "carré", "Announcements: none.", "Only the table owner can change announcements.",
                "Announcements cannot change after the game starts.",
                "Public tables always play with announcements.", RULES);

        for (String locale : List.of("/static/i18n.js", "/static/i18n-nl.js")) {
            String dictionary = resource(locale);
            for (String text : texts) {
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
