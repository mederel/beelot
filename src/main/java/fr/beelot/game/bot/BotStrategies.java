package fr.beelot.game.bot;

import fr.beelot.game.BotDifficulty;

/**
 * The strategy each difficulty level plays. Until the Challenging strategy exists (US-056), both levels play the
 * current rules, each through its own instance.
 */
public final class BotStrategies {

    private static final BotStrategy RELAXED = new RuleBasedStrategy();
    private static final BotStrategy CHALLENGING = new RuleBasedStrategy();

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
