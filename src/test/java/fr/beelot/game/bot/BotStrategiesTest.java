package fr.beelot.game.bot;

import fr.beelot.game.BotDifficulty;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;

class BotStrategiesTest {

    @Test
    void eachDifficultyHasItsOwnStrategy() {
        assertNotSame(BotStrategies.forDifficulty(BotDifficulty.RELAXED),
                BotStrategies.forDifficulty(BotDifficulty.CHALLENGING));
    }

    @Test
    void bothLevelsPlayTheCurrentRulesUntilTheChallengingStrategyExists() {
        for (BotDifficulty difficulty : BotDifficulty.values()) {
            assertInstanceOf(RuleBasedStrategy.class, BotStrategies.forDifficulty(difficulty));
        }
    }

    @Test
    void tablesUseTheChallengingStrategy() {
        assertSame(BotStrategies.forDifficulty(BotDifficulty.CHALLENGING), BotStrategies.forTables());
    }
}
