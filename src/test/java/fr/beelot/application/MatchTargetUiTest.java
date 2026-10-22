package fr.beelot.application;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Choosing the match target and showing it in the web client (US-062). */
class MatchTargetUiTest {

    static final String RULES = "The first team to reach the match target (1,000 points unless the players choose "
            + "500, 1,500 or 2,000) wins the match. When both teams reach it in the same round, the higher score wins; "
            + "an exact tie is settled by another round.";
    static final String SCORE_LINE = "Match score — North–South {0} · East–West {1} · to {2}";

    @Test
    void setupOffersTheTargets() throws IOException {
        String html = resource("/static/index.html");

        for (String group : List.of("target", "local-target", "table-target")) {
            for (String value : List.of("500", "1000", "1500", "2000")) {
                assertTrue(html.contains("name=\"" + group + "\" type=\"radio\" value=\"" + value + "\""),
                        group + " " + value);
            }
            assertTrue(html.contains("checked name=\"" + group + "\" type=\"radio\" value=\"1000\"")
                    || html.contains("checked id=\"" + group + "-1000\" name=\"" + group + "\" type=\"radio\" value=\"1000\""),
                    group + " defaults to 1,000");
        }
        assertTrue(html.contains("id=\"target-settings\""));
        assertTrue(html.contains("id=\"target-summary\""));
    }

    @Test
    void requestsCarryTheTarget() throws IOException {
        String app = resource("/static/app.js");

        assertTrue(app.contains("target: Number(form.get(\"target\"))"));
        assertTrue(app.contains("target: Number(form.get(\"local-target\"))"));
        assertTrue(app.contains("/target`"));
        assertTrue(app.contains("setChoice(\"table-target\", String(table.target))"));
    }

    @Test
    void scoresAndStatisticsShowTheTarget() throws IOException {
        String app = resource("/static/app.js");

        assertTrue(count(app, "\"" + SCORE_LINE + "\"") >= 2, "solo and private score lines");
        assertFalse(app.contains("\"Match score — North–South {0} · East–West {1}\""));
        assertTrue(app.contains("formatNumber(match.target)"));
        assertTrue(app.contains("\"Target\""));
    }

    @Test
    void rulesStateTheTarget() throws IOException {
        String rules = resource("/static/index.html");

        assertTrue(rules.contains(RULES));
        assertFalse(rules.contains("The first team to reach 1,000 points wins the match."));
    }

    @Test
    void everyNewTextIsTranslated() throws IOException {
        List<String> texts = List.of("Match target", "500 points", "1,000 points", "1,500 points", "2,000 points",
                "A quick match.", "The usual match.", "A long match.", "A very long match.",
                "The match is played to {0} points.", "Target", SCORE_LINE, RULES,
                "Only the table owner can change the match target.",
                "The match target cannot change after the game starts.", "Public tables always play to 1,000 points.",
                "The match target must be 500, 1,000, 1,500 or 2,000 points.");

        for (String locale : List.of("/static/i18n.js", "/static/i18n-nl.js")) {
            String dictionary = resource(locale);
            for (String text : texts) {
                assertTrue(dictionary.contains("\"" + text + "\":"), () -> locale + " does not translate: " + text);
            }
        }
    }

    private static int count(String text, String part) {
        int count = 0;
        for (int index = text.indexOf(part); index >= 0; index = text.indexOf(part, index + 1)) count++;
        return count;
    }

    private static String resource(String path) throws IOException {
        try (var stream = MatchTargetUiTest.class.getResourceAsStream(path)) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
