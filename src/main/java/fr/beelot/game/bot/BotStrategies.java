package fr.beelot.game.bot;

import fr.beelot.game.BotDifficulty;

import java.util.SplittableRandom;

/**
 * The strategy each difficulty level plays: Relaxed bots follow the hand-written rules, and Challenging bots search
 * sampled deals before playing a card (US-056).
 */
public final class BotStrategies {

    private static final BotStrategy RELAXED = new RuleBasedStrategy();
    private static final BotStrategy CHALLENGING = new SamplingStrategy(new SplittableRandom().nextLong());

    private BotStrategies() {
    }

    public static BotStrategy forDifficulty(BotDifficulty difficulty) {
        return switch (difficulty) {
            case RELAXED -> RELAXED;
            case CHALLENGING -> CHALLENGING;
        };
    }

    /** Bots at private and public tables play at the Challenging level. */
    public static BotStrategy forTables() {
        return forDifficulty(BotDifficulty.CHALLENGING);
    }
}
