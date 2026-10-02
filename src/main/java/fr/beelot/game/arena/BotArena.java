package fr.beelot.game.arena;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameVariant;
import fr.beelot.game.MatchScore;

import java.util.Arrays;
import java.util.List;
import java.util.Random;
import java.util.SplittableRandom;
import java.util.UUID;
import java.util.random.RandomGenerator;

/**
 * Plays two bots against each other on seeded deals, in the duplicate format: every deal is played twice with the
 * same cards in the same seats, once with the first bot as North–South and once with it as East–West. A deal where
 * everyone passes counts as a redeal worth no points; the cards are not dealt again.
 */
public final class BotArena {

    private final ArenaBot first;
    private final ArenaBot second;
    private final List<GameBoard.GamePlayer> players = List.of(
            new GameBoard.GamePlayer(UUID.randomUUID(), "North"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "East"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "South"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "West"));

    public BotArena(ArenaBot first, ArenaBot second) {
        this.first = first;
        this.second = second;
    }

    public ArenaReport run(GameVariant variant, int dealPairs, long seed) {
        if (dealPairs < 2) throw new IllegalArgumentException("The arena needs at least two deal pairs.");
        Tally tally = new Tally(dealPairs);
        SplittableRandom dealSeeds = new SplittableRandom(seed);
        MatchScore firstNorthSouthMatch = new MatchScore();
        MatchScore firstEastWestMatch = new MatchScore();
        for (int pair = 0; pair < dealPairs; pair++) {
            long dealSeed = dealSeeds.nextLong();
            int dealer = pair % players.size();
            Deal firstNorthSouth = play(variant, dealSeed, dealer, first, second, tally);
            Deal firstEastWest = play(variant, dealSeed, dealer, second, first, tally);
            tally.pair(firstNorthSouth, firstEastWest);
            firstNorthSouthMatch = tally.match(firstNorthSouthMatch, firstNorthSouth, true);
            firstEastWestMatch = tally.match(firstEastWestMatch, firstEastWest, false);
        }
        return tally.report(variant, dealPairs, seed);
    }

    private Deal play(GameVariant variant, long dealSeed, int dealer, ArenaBot northSouth, ArenaBot eastWest,
                      Tally tally) {
        BiddingState bidding = new BiddingState(players, variant, dealer, new Random(dealSeed));
        RandomGenerator botRandom = new SplittableRandom(dealSeed);
        while (bidding.completedBoard() == null && bidding.deals() == 1) {
            seatedBot(bidding.activePlayerId(), northSouth, eastWest).takeAuctionTurn(bidding, variant, botRandom);
        }
        GameBoard board = bidding.completedBoard();
        if (board == null) return Deal.REDEALT;
        UUID observer = players.getFirst().playerId();
        GameBoard.GameBoardView view = board.viewFor(observer);
        while (view.roundResult() == null) {
            if (view.reviewingCompletedTrick()) {
                board.continueAfterTrick();
            } else {
                ArenaBot bot = seatedBot(board.activePlayerId(), northSouth, eastWest);
                long start = System.nanoTime();
                bot.playCard(board, botRandom);
                tally.decision(bot == first, System.nanoTime() - start);
            }
            view = board.viewFor(observer);
        }
        return new Deal(view.roundResult(), view.declaringTeam().equals("North–South"), view.coinched());
    }

    private ArenaBot seatedBot(UUID playerId, ArenaBot northSouth, ArenaBot eastWest) {
        for (int index = 0; index < players.size(); index++) {
            if (players.get(index).playerId().equals(playerId)) return index % 2 == 0 ? northSouth : eastWest;
        }
        throw new IllegalArgumentException("Unknown player");
    }

    /** One played deal; a redeal has no round result. */
    private record Deal(GameBoard.RoundResult result, boolean northSouthDeclared, boolean coinched) {

        static final Deal REDEALT = new Deal(null, false, false);

        boolean redealt() {
            return result == null;
        }

        int points(boolean northSouth) {
            if (redealt()) return 0;
            return northSouth ? result.northSouthAwarded() : result.eastWestAwarded();
        }
    }

    private final class Tally {

        private final double[] pairDifferences;
        private int pairs;
        private int matches;
        private int firstMatchWins;
        private final int[] contracts = new int[2];
        private final int[] contractsMade = new int[2];
        private final int[] coinches = new int[2];
        private final int[] coinchesWon = new int[2];
        private int deals;
        private int redeals;
        private final Decisions firstDecisions = new Decisions();
        private final Decisions secondDecisions = new Decisions();

        Tally(int dealPairs) {
            pairDifferences = new double[dealPairs];
        }

        void decision(boolean byFirst, long nanos) {
            (byFirst ? firstDecisions : secondDecisions).add(nanos);
        }

        void pair(Deal firstNorthSouth, Deal firstEastWest) {
            int difference = firstNorthSouth.points(true) - firstNorthSouth.points(false)
                    + firstEastWest.points(false) - firstEastWest.points(true);
            pairDifferences[pairs++] = difference / 2.0;
            contract(firstNorthSouth, true);
            contract(firstEastWest, false);
        }

        private void contract(Deal deal, boolean firstIsNorthSouth) {
            deals++;
            if (deal.redealt()) {
                redeals++;
                return;
            }
            int declarer = deal.northSouthDeclared() == firstIsNorthSouth ? 0 : 1;
            contracts[declarer]++;
            if (deal.result().contractMade()) contractsMade[declarer]++;
            if (deal.coinched()) {
                coinches[1 - declarer]++;
                if (!deal.result().contractMade()) coinchesWon[1 - declarer]++;
            }
        }

        /** Records the deal in the running match and returns the match to continue with. */
        MatchScore match(MatchScore match, Deal deal, boolean firstIsNorthSouth) {
            if (deal.redealt()) return match;
            match.record(deal.result());
            if (!match.complete()) return match;
            matches++;
            if (match.winner().equals("North–South") == firstIsNorthSouth) firstMatchWins++;
            return new MatchScore();
        }

        ArenaReport report(GameVariant variant, int dealPairs, long seed) {
            double mean = Arrays.stream(pairDifferences).average().orElse(0);
            double variance = Arrays.stream(pairDifferences).map(d -> (d - mean) * (d - mean)).sum() / (pairs - 1);
            double margin = 1.96 * Math.sqrt(variance / pairs);
            return new ArenaReport(variant, first.name(), second.name(), dealPairs, seed, mean, margin,
                    new ArenaReport.Rate(firstMatchWins, matches),
                    new ArenaReport.Rate(contractsMade[0], contracts[0]),
                    new ArenaReport.Rate(contractsMade[1], contracts[1]),
                    new ArenaReport.Rate(coinchesWon[0], coinches[0]),
                    new ArenaReport.Rate(coinchesWon[1], coinches[1]),
                    new ArenaReport.Rate(redeals, deals),
                    firstDecisions.timing(), secondDecisions.timing());
        }
    }

    private static final class Decisions {

        private long[] nanos = new long[1024];
        private int count;

        void add(long value) {
            if (count == nanos.length) nanos = Arrays.copyOf(nanos, count * 2);
            nanos[count++] = value;
        }

        ArenaReport.Timing timing() {
            if (count == 0) return new ArenaReport.Timing(0, 0, 0);
            long[] sorted = Arrays.copyOf(nanos, count);
            Arrays.sort(sorted);
            double average = Arrays.stream(sorted).average().orElse(0) / 1_000;
            double p99 = sorted[Math.min(count - 1, (int) Math.ceil(count * 0.99) - 1)] / 1_000.0;
            return new ArenaReport.Timing(count, average, p99);
        }
    }
}
