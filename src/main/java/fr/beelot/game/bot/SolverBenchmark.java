package fr.beelot.game.bot;

import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

/**
 * Times the double-dummy solver on seeded deals: a full round, and the same round from the fourth trick after the
 * current bot has played the first three. Options: {@code --deals} (default 200) and {@code --seed} (default 1).
 */
public final class SolverBenchmark {

    private static final String[] RANKS = {"7", "8", "9", "10", "J", "Q", "K", "A"};
    private static final int WARM_UP_DEALS = 30;

    private SolverBenchmark() {
    }

    public static void main(String[] args) {
        int deals = 200;
        long seed = 1;
        for (int index = 0; index + 1 < args.length; index += 2) {
            switch (args[index]) {
                case "--deals" -> deals = Integer.parseInt(args[index + 1]);
                case "--seed" -> seed = Long.parseLong(args[index + 1]);
                default -> throw new IllegalArgumentException("Unexpected argument " + args[index]);
            }
        }
        DoubleDummySolver solver = new DoubleDummySolver();
        run(solver, WARM_UP_DEALS, seed + 1);
        Timings timings = run(solver, deals, seed);
        System.out.println(timings.full().format("Full round"));
        System.out.println(timings.fromFourthTrick().format("From the fourth trick"));
    }

    private static Timings run(DoubleDummySolver solver, int deals, long seed) {
        List<GameBoard.GamePlayer> players = new ArrayList<>();
        for (int seat = 0; seat < 4; seat++) players.add(new GameBoard.GamePlayer(UUID.randomUUID(), "Seat " + seat));
        BotStrategy bot = new RuleBasedStrategy();
        Random random = new Random(seed);
        long[] full = new long[deals];
        long[] fourth = new long[deals];
        long[] fullNodes = new long[deals];
        long[] fourthNodes = new long[deals];
        for (int deal = 0; deal < deals; deal++) {
            List<GameCard> deck = new ArrayList<>();
            for (GameCard.Suit suit : GameCard.Suit.values()) for (String rank : RANKS) deck.add(new GameCard(rank, suit));
            Collections.shuffle(deck, random);
            List<List<GameCard>> hands = new ArrayList<>();
            Map<UUID, List<GameCard>> dealt = new HashMap<>();
            for (int seat = 0; seat < 4; seat++) {
                hands.add(deck.subList(seat * 8, seat * 8 + 8));
                dealt.put(players.get(seat).playerId(), hands.get(seat));
            }
            GameCard.Suit trump = GameCard.Suit.values()[random.nextInt(4)];
            int dealer = deal % 4;
            int leader = (dealer + 1) % 4;

            long nodesBefore = solver.nodes();
            long start = System.nanoTime();
            solver.solve(DoubleDummySolver.Position.start(hands, trump, leader));
            full[deal] = System.nanoTime() - start;
            fullNodes[deal] = solver.nodes() - nodesBefore;

            GameBoard board = GameBoard.fromContract(players, dealt, trump, deal % 2, 80, false, dealer);
            UUID observer = players.getFirst().playerId();
            while (board.viewFor(observer).completedTricks() < 3 || board.viewFor(observer).reviewingCompletedTrick()) {
                if (board.viewFor(observer).reviewingCompletedTrick()) board.continueAfterTrick();
                else BotTurns.playTurn(board, bot);
            }
            GameBoard.PlayView view = board.playViewFor(board.activePlayerId());
            List<List<GameCard>> remaining = new ArrayList<>();
            for (GameBoard.GamePlayer player : players) remaining.add(board.playViewFor(player.playerId()).hand());
            nodesBefore = solver.nodes();
            start = System.nanoTime();
            solver.solve(new DoubleDummySolver.Position(remaining, trump, view.tricks(), view.currentTrick(), leader));
            fourth[deal] = System.nanoTime() - start;
            fourthNodes[deal] = solver.nodes() - nodesBefore;
        }
        return new Timings(new Summary(full, fullNodes), new Summary(fourth, fourthNodes));
    }

    private record Timings(Summary full, Summary fromFourthTrick) {
    }

    private record Summary(long[] nanos, long[] nodes) {

        String format(String label) {
            long[] sorted = nanos.clone();
            Arrays.sort(sorted);
            double average = Arrays.stream(sorted).average().orElse(0) / 1e6;
            double median = sorted[sorted.length / 2] / 1e6;
            double p95 = sorted[Math.min(sorted.length - 1, (int) Math.ceil(sorted.length * 0.95) - 1)] / 1e6;
            double max = sorted[sorted.length - 1] / 1e6;
            double averageNodes = Arrays.stream(nodes).average().orElse(0);
            return String.format(Locale.ROOT, "%s (%d deals): avg %.2f ms, median %.2f ms, p95 %.2f ms, max %.2f ms,"
                    + " avg %.0f positions", label, sorted.length, average, median, p95, max, averageNodes);
        }
    }
}
