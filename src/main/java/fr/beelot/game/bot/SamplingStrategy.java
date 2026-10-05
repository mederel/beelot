package fr.beelot.game.bot;

import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.GameVariant;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Queue;
import java.util.SplittableRandom;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * The Challenging bot (US-056). It bids like the rule-based bot. To choose a card, it samples deals of the cards it
 * has not seen, consistent with its own hand, the cards played and the voids shown; solves each sample for every
 * legal card with the double-dummy solver; and plays the card with the best average score (Perfect Information Monte
 * Carlo). Early in the round, where solving a sample takes too long, it plays like the rule-based bot.
 *
 * <p>A strategy may be shared between tables: each decision draws its samples from a generator seeded by the
 * strategy's seed and the bot's view, so the same view gives the same card as long as the time budget does not
 * cut the search short, and it borrows a solver from a pool.
 */
public final class SamplingStrategy implements BotStrategy {

    public static final Duration DEFAULT_BUDGET = Duration.ofMillis(200);
    static final int DEFAULT_SAMPLES = 50;
    static final int DEFAULT_FIRST_SEARCHED_TRICK = 3;
    private static final int DEAL_ATTEMPTS = 50;

    private final RuleBasedStrategy rules = new RuleBasedStrategy();
    private final long seed;
    private final int samples;
    private final long budgetNanos;
    private final int firstSearchedTrick;
    private final Queue<DoubleDummySolver> solvers = new ConcurrentLinkedQueue<>();

    public SamplingStrategy(long seed) {
        this(seed, DEFAULT_SAMPLES, DEFAULT_BUDGET, DEFAULT_FIRST_SEARCHED_TRICK);
    }

    /**
     * A strategy that solves up to the given number of samples per card, within the time budget, from the given trick
     * (numbered from 1) onwards.
     */
    public SamplingStrategy(long seed, int samples, Duration budget, int firstSearchedTrick) {
        if (samples < 1) throw new IllegalArgumentException("A bot needs at least one sample.");
        this.seed = seed;
        this.samples = samples;
        this.budgetNanos = budget.toNanos();
        this.firstSearchedTrick = firstSearchedTrick;
    }

    @Override
    public AuctionDecision decideAuction(BiddingState.AuctionView view) {
        return rules.decideAuction(view);
    }

    @Override
    public GameCard chooseCard(GameBoard.PlayView view) {
        List<GameCard> legal = view.legalCards();
        if (legal.size() == 1 || view.tricks().size() + 1 < firstSearchedTrick) return rules.chooseCard(view);
        long deadline = System.nanoTime() + budgetNanos;
        DoubleDummySolver solver = solvers.poll();
        if (solver == null) solver = new DoubleDummySolver();
        try {
            return search(view, legal, solver, deadline);
        } finally {
            solvers.offer(solver);
        }
    }

    private GameCard search(GameBoard.PlayView view, List<GameCard> legal, DoubleDummySolver solver, long deadline) {
        CardMemory memory = new CardMemory(view);
        SplittableRandom random = new SplittableRandom(seed ^ fingerprint(view));
        long[] totals = new long[legal.size()];
        int solved = 0;
        while (solved < samples && System.nanoTime() < deadline) {
            List<List<GameCard>> hands = deal(view, memory, random);
            if (hands == null) break;
            long[] scores = new long[legal.size()];
            boolean complete = true;
            for (int index = 0; index < legal.size() && complete; index++) {
                scores[index] = score(view, hands, legal.get(index), solver);
                complete = System.nanoTime() < deadline || index == legal.size() - 1;
            }
            if (!complete) break;
            for (int index = 0; index < legal.size(); index++) totals[index] += scores[index];
            solved++;
        }
        if (solved == 0) return rules.chooseCard(view);
        int best = 0;
        for (int index = 1; index < legal.size(); index++) if (totals[index] > totals[best]) best = index;
        return legal.get(best);
    }

    /**
     * Deals the unseen cards to the other three seats: each seat receives as many cards as it still holds, and no
     * card of a suit it has shown to be void in. The most constrained cards are dealt first. Returns null when no
     * consistent deal is found.
     */
    static List<List<GameCard>> deal(GameBoard.PlayView view, CardMemory memory, SplittableRandom random) {
        int[] capacity = new int[4];
        for (int seat = 0; seat < 4; seat++) capacity[seat] = 8;
        view.tricks().forEach(trick -> trick.forEach(played -> capacity[played.seat()]--));
        view.currentTrick().forEach(played -> capacity[played.seat()]--);
        capacity[view.seat()] = 0;
        List<GameCard> unseen = new ArrayList<>(memory.unseenCards());
        for (int attempt = 0; attempt < DEAL_ATTEMPTS; attempt++) {
            List<List<GameCard>> hands = tryDeal(view, memory, unseen, capacity.clone(), random);
            if (hands != null) return hands;
        }
        return null;
    }

    private static List<List<GameCard>> tryDeal(GameBoard.PlayView view, CardMemory memory, List<GameCard> unseen,
                                                int[] capacity, SplittableRandom random) {
        List<List<GameCard>> hands = new ArrayList<>();
        for (int seat = 0; seat < 4; seat++) hands.add(new ArrayList<>());
        hands.get(view.seat()).addAll(view.hand());
        List<GameCard> cards = new ArrayList<>(unseen);
        for (int index = cards.size() - 1; index > 0; index--) {
            int other = random.nextInt(index + 1);
            cards.set(other, cards.set(index, cards.get(other)));
        }
        cards.sort(Comparator.comparingInt(card -> allowedSeats(card, view, memory)));
        for (GameCard card : cards) {
            int total = 0;
            for (int seat = 0; seat < 4; seat++) if (allows(seat, card, view, memory)) total += capacity[seat];
            if (total == 0) return null;
            int pick = random.nextInt(total);
            for (int seat = 0; seat < 4; seat++) {
                if (!allows(seat, card, view, memory)) continue;
                pick -= capacity[seat];
                if (pick < 0) {
                    hands.get(seat).add(card);
                    capacity[seat]--;
                    break;
                }
            }
        }
        return hands;
    }

    private static int allowedSeats(GameCard card, GameBoard.PlayView view, CardMemory memory) {
        int count = 0;
        for (int seat = 0; seat < 4; seat++) if (allows(seat, card, view, memory)) count++;
        return count;
    }

    private static boolean allows(int seat, GameCard card, GameBoard.PlayView view, CardMemory memory) {
        return seat != view.seat() && !memory.shownVoid(seat, card.suit());
    }

    /** The score difference the bot's team can force in the sample after playing the card. */
    private static long score(GameBoard.PlayView view, List<List<GameCard>> hands, GameCard card,
                              DoubleDummySolver solver) {
        List<List<GameCard>> remaining = new ArrayList<>(hands);
        List<GameCard> own = new ArrayList<>(hands.get(view.seat()));
        own.remove(card);
        remaining.set(view.seat(), own);
        List<List<GameBoard.SeatCard>> tricks = new ArrayList<>(view.tricks());
        List<GameBoard.SeatCard> trick = new ArrayList<>(view.currentTrick());
        trick.add(new GameBoard.SeatCard(view.seat(), card));
        if (trick.size() == 4) {
            tricks.add(trick);
            trick = List.of();
        }
        DoubleDummySolver.Solution solution = solver.solve(
                new DoubleDummySolver.Position(remaining, view.trump(), tricks, trick, view.seat()));
        return outcome(view, hands, solution.northSouthPoints(), solution.eastWestPoints());
    }

    /**
     * The bot's team's score less the opponents', as the round would be scored with these points (belote included):
     * a declaring team below its contract scores only its belote while the defenders score 162 and theirs.
     */
    static long outcome(GameBoard.PlayView view, List<List<GameCard>> hands, int northSouth, int eastWest) {
        int beloteSeat = beloteSeat(view, hands);
        int[] belote = new int[2];
        if (beloteSeat >= 0) belote[beloteSeat % 2] = 20;
        int[] total = {northSouth, eastWest};
        int declarers = view.declaringSeat() % 2;
        int contract = view.variant() == GameVariant.CONTREE ? view.contractValue() : 82;
        if (total[declarers] - belote[declarers] < contract) {
            total[declarers] = belote[declarers];
            total[1 - declarers] = 162 + belote[1 - declarers];
        }
        int team = view.seat() % 2;
        return total[team] - total[1 - team];
    }

    /** The seat dealt both the king and the queen of trumps in the sample, or -1. */
    private static int beloteSeat(GameBoard.PlayView view, List<List<GameCard>> hands) {
        GameCard king = new GameCard("K", view.trump());
        GameCard queen = new GameCard("Q", view.trump());
        for (int seat = 0; seat < 4; seat++) {
            List<GameCard> dealt = new ArrayList<>(hands.get(seat));
            for (List<GameBoard.SeatCard> trick : view.tricks()) {
                for (GameBoard.SeatCard played : trick) if (played.seat() == seat) dealt.add(played.card());
            }
            for (GameBoard.SeatCard played : view.currentTrick()) if (played.seat() == seat) dealt.add(played.card());
            if (dealt.contains(king) && dealt.contains(queen)) return seat;
        }
        return -1;
    }

    /** A number identifying the bot's view that is the same in every run, unlike the hash codes of enums. */
    private static long fingerprint(GameBoard.PlayView view) {
        long hash = 31L * view.seat() + view.trump().ordinal();
        for (GameCard card : view.hand()) hash = mix(hash, card);
        for (List<GameBoard.SeatCard> trick : view.tricks()) {
            for (GameBoard.SeatCard played : trick) hash = mix(hash * 7 + played.seat(), played.card());
        }
        for (GameBoard.SeatCard played : view.currentTrick()) hash = mix(hash * 7 + played.seat(), played.card());
        return hash;
    }

    private static long mix(long hash, GameCard card) {
        return (hash * 0x9E3779B97F4A7C15L) ^ (31L * card.rank().hashCode() + card.suit().ordinal());
    }
}
