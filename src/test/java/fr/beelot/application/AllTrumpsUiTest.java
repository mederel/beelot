package fr.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/** Choosing, bidding and showing all trumps and no trumps in the web client (US-063). */
class AllTrumpsUiTest {

    static final String RULES_BIDS = "Besides the four suits, a Contrée bid can name sans-atout (no trumps) or "
            + "tout-atout (all trumps) when the table plays them. A bid must be higher in value whatever the contract. "
            + "Nothing is cut in either contract: follow the lead suit when you can, otherwise play any card. "
            + "In tout-atout you must also beat the winning card when you can.";
    static final String RULES_NO_TRUMPS = "Sans-atout card points: Ace 19, 10 10, King 4, Queen 3, Jack 2, 9, 8 and 7 0. "
            + "Order: ace, 10, king, queen, jack, 9, 8, 7. The cards total 162 with the 10 points for the last trick "
            + "(Dix de der).";
    static final String RULES_ALL_TRUMPS = "Tout-atout card points: Jack 13, 9 9, Ace 6, 10 5, King 3, Queen 2, 8 and 7 0. "
            + "Order in every suit: jack, 9, ace, 10, king, queen, 8, 7. The cards total 162 with the 10 points for "
            + "the last trick (Dix de der).";
    static final String RULES_BELOTE = "In tout-atout, Belote/Rebelote can be declared in every suit; sans-atout has none. "
            + "Sans-atout carrés score aces 200, tens 150, and kings, queens, jacks or nines 100.";

    @Test
    void setupOffersTheOption() throws IOException {
        String html = resource("/static/index.html");
        String app = resource("/static/app.js");

        for (String group : List.of("all-trumps", "local-all-trumps", "table-all-trumps")) {
            assertTrue(html.contains("checked name=\"" + group + "\" type=\"radio\" value=\"on\"")
                    || html.contains("checked id=\"" + group + "-on\" name=\"" + group + "\" type=\"radio\" value=\"on\""),
                    group + " defaults to on");
            assertTrue(html.contains("name=\"" + group + "\" type=\"radio\" value=\"off\""), group + " off");
        }
        assertTrue(html.contains("id=\"all-trumps-settings\""));
        assertTrue(html.contains("id=\"all-trumps-summary\""));
        assertTrue(app.contains("allTrumps: form.get(\"all-trumps\") !== \"off\""));
        assertTrue(app.contains("allTrumps: form.get(\"local-all-trumps\") !== \"off\""));
        assertTrue(app.contains("/all-trumps`"));
    }

    @Test
    void auctionsOfferTheContracts() throws IOException {
        String html = resource("/static/index.html");
        String app = resource("/static/app.js");

        for (String group : List.of("contract-suit", "private-contract-suit")) {
            for (String value : List.of("ALL_TRUMPS", "NO_TRUMPS")) {
                assertTrue(html.contains("name=\"" + group + "\" type=\"radio\" value=\"" + value + "\""),
                        group + " " + value);
            }
        }
        assertTrue(app.contains("input.value === \"ALL_TRUMPS\" || input.value === \"NO_TRUMPS\""));
        assertTrue(app.contains("game.allTrumps"));
        assertTrue(app.contains("privateAllTrumps"));
    }

    @Test
    void englishNamesTheContracts() throws IOException {
        String i18n = resource("/static/i18n.js");
        String dutch = resource("/static/i18n-nl.js");

        // One key for the enum name ALL_TRUMPS and the display string "All trumps", in every language.
        assertTrue(i18n.contains("toLowerCase().replace(\"_\", \" \")"));
        assertTrue(i18n.contains("\"all trumps\": \"tout atout\", \"no trumps\": \"sans atout\""));
        assertTrue(dutch.contains("\"all trumps\": \"alles troef\", \"no trumps\": \"geen troef\""));
        assertTrue(!i18n.contains("all_trumps\":") && !dutch.contains("all_trumps\":"));
        // Server messages and call labels ("bids 100 All trumps.", "100 All trumps") are matched as suit words.
        assertTrue(i18n.contains("ALL_TRUMPS|NO_TRUMPS|Clubs|Diamonds|Hearts|Spades|All trumps|No trumps"));
    }

    @Test
    void rulesExplainTheContracts() throws IOException {
        String html = resource("/static/index.html");
        String rules = html.substring(html.indexOf("data-view=\"rules\""));

        assertTrue(rules.contains("<h2>Tout-atout and sans-atout</h2>"));
        for (String text : List.of(RULES_BIDS, RULES_NO_TRUMPS, RULES_ALL_TRUMPS, RULES_BELOTE)) {
            assertTrue(rules.contains(text), text);
        }
    }

    @Test
    void everyNewTextIsTranslated() throws IOException {
        List<String> texts = List.of("Tout-atout and sans-atout", "Bids may also name all trumps or no trumps.",
                "Only the four suits are played.", "Tout-atout and sans-atout are played.", "All trumps", "No trumps",
                "Only the table owner can change tout-atout and sans-atout.",
                "Tout-atout and sans-atout cannot change after the game starts.",
                "Public tables always play with tout-atout and sans-atout.",
                "Tout-atout and sans-atout are not played at this table.",
                RULES_BIDS, RULES_NO_TRUMPS, RULES_ALL_TRUMPS, RULES_BELOTE);

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
