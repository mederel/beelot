package fr.beelot.game.arena;

import fr.beelot.game.GameVariant;

import java.util.Locale;

/**
 * Results of an arena run, seen from the first bot. Each deal pair is one deal played twice with the teams swapped.
 */
public record ArenaReport(GameVariant variant, String first, String second, int dealPairs, long seed,
                          double pointDifference, double pointDifferenceMargin, Rate firstMatchWins,
                          Rate firstContracts, Rate secondContracts, Rate firstCoinches, Rate secondCoinches,
                          Rate redeals, Timing firstTiming, Timing secondTiming) {

    private static final double Z_95 = 1.96;

    public String format() {
        return String.format(Locale.ROOT, """
                        Bot arena — %s
                        %s vs %s, %d duplicate deal pairs, seed %d

                        Point difference per deal (%s − %s): %+.2f ± %.2f (95%% CI %+.2f to %+.2f)
                        Matches to 1,000 won by %s: %s
                        Contract success: %s %s; %s %s
                        Coinche success: %s %s; %s %s
                        Redeal rate: %s
                        Decision time per card: %s %s; %s %s
                        """,
                variant.displayName(), first, second, dealPairs, seed,
                first, second, pointDifference, pointDifferenceMargin,
                pointDifference - pointDifferenceMargin, pointDifference + pointDifferenceMargin,
                first, firstMatchWins.formatWithInterval(),
                first, firstContracts.format(), second, secondContracts.format(),
                first, firstCoinches.format(), second, secondCoinches.format(),
                redeals.format(),
                first, firstTiming.format(), second, secondTiming.format());
    }

    /** Successes out of attempts. */
    public record Rate(int successes, int attempts) {

        public double ratio() {
            return attempts == 0 ? Double.NaN : (double) successes / attempts;
        }

        /** Wilson score 95% interval, as {lower, upper}. */
        public double[] wilsonInterval() {
            if (attempts == 0) return new double[]{Double.NaN, Double.NaN};
            double p = ratio();
            double z2 = Z_95 * Z_95;
            double centre = (p + z2 / (2 * attempts)) / (1 + z2 / attempts);
            double margin = Z_95 * Math.sqrt(p * (1 - p) / attempts + z2 / (4.0 * attempts * attempts))
                    / (1 + z2 / attempts);
            return new double[]{centre - margin, centre + margin};
        }

        String format() {
            if (attempts == 0) return "n/a (0/0)";
            return String.format(Locale.ROOT, "%.1f%% (%d/%d)", 100 * ratio(), successes, attempts);
        }

        String formatWithInterval() {
            if (attempts == 0) return format();
            double[] interval = wilsonInterval();
            return String.format(Locale.ROOT, "%s, 95%% CI %.1f%%–%.1f%%", format(), 100 * interval[0],
                    100 * interval[1]);
        }
    }

    /** Time a bot takes to choose a card, in microseconds. */
    public record Timing(int cards, double averageMicros, double p99Micros) {

        String format() {
            if (cards == 0) return "n/a";
            return String.format(Locale.ROOT, "avg %.1f µs, p99 %.1f µs", averageMicros, p99Micros);
        }
    }
}
