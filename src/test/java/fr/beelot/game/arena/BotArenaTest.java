package fr.beelot.game.arena;

import fr.beelot.game.GameVariant;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** A short arena run, checking that the arena still works. Longer runs use {@code ./gradlew botArena}. */
class BotArenaTest {

    private static final int DEAL_PAIRS = 200;

    @Test
    void aBotPlayingItselfScoresEvenOnEveryDealPair() {
        ArenaReport report = new BotArena(ArenaBot.named("random"), ArenaBot.named("random"))
                .run(GameVariant.CONTREE, DEAL_PAIRS, 7);

        assertEquals(0, report.pointDifference());
        assertEquals(0, report.pointDifferenceMargin());
    }

    @Test
    void theSameSeedGivesTheSameResults() {
        BotArena arena = new BotArena(ArenaBot.named("current"), ArenaBot.named("random"));

        ArenaReport firstRun = arena.run(GameVariant.CONTREE, DEAL_PAIRS, 42);
        ArenaReport secondRun = arena.run(GameVariant.CONTREE, DEAL_PAIRS, 42);

        assertEquals(firstRun.pointDifference(), secondRun.pointDifference());
        assertEquals(firstRun.firstMatchWins(), secondRun.firstMatchWins());
        assertEquals(firstRun.firstContracts(), secondRun.firstContracts());
    }

    @Test
    void theCurrentBotBeatsRandomCardPlayInContree() {
        ArenaReport report = new BotArena(ArenaBot.named("current"), ArenaBot.named("random"))
                .run(GameVariant.CONTREE, DEAL_PAIRS, 1);

        assertTrue(report.pointDifference() > 0, report.format());
        assertEquals(2 * DEAL_PAIRS, report.firstContracts().attempts() + report.secondContracts().attempts());
        assertEquals(0, report.redeals().successes());
        assertTrue(report.firstMatchWins().attempts() > 0, report.format());
        // The last trick is played automatically, so each bot chooses seven cards for each of its two seats.
        assertEquals(2 * DEAL_PAIRS * 14, report.firstTiming().cards());
    }

    @Test
    void botsTakeAndPlayClassicContracts() {
        ArenaReport report = new BotArena(ArenaBot.named("current"), ArenaBot.named("random"))
                .run(GameVariant.CLASSIC, DEAL_PAIRS, 1);

        assertTrue(report.redeals().successes() < report.redeals().attempts(), "some classic deals are taken");
        assertTrue(report.firstContracts().attempts() > 0);
        assertTrue(report.firstTiming().cards() > 0, "classic contracts are played out");
    }

    @Test
    void takingClassicContractsBeatsNeverTaking() {
        ArenaReport report = new BotArena(ArenaBot.named("current"), ArenaBot.named("passive"))
                .run(GameVariant.CLASSIC, DEAL_PAIRS, 1);

        assertTrue(report.pointDifference() - report.pointDifferenceMargin() > 0, report.format());
    }

    @Test
    void wilsonIntervalSurroundsTheObservedRate() {
        double[] interval = new ArenaReport.Rate(60, 100).wilsonInterval();

        assertEquals(0.502, interval[0], 0.001);
        assertEquals(0.691, interval[1], 0.001);
    }
}
