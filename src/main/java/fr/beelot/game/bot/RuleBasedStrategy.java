package fr.beelot.game.bot;

import fr.beelot.game.BeloteRules;
import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.GameVariant;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;

/**
 * The bot players meet in the application: hand-written bidding rules (US-050, US-051) and card-play rules (US-053,
 * US-054).
 */
public final class RuleBasedStrategy implements BotStrategy {

    private static final int MAX_BID = 160;
    static final int TAKING_THRESHOLD = 6;
    static final int BIDDING_MARGIN = 15;
    static final int LOW_VALUE_TRICK = 15;

    private final int takingThreshold;
    private final int biddingMargin;
    private final boolean trumpControl;

    public RuleBasedStrategy() {
        this(TAKING_THRESHOLD, BIDDING_MARGIN, true);
    }

    /** The same bidding, with the card play of US-053: the bot does not manage its trumps (US-054). */
    public static RuleBasedStrategy withoutTrumpControl() {
        return new RuleBasedStrategy(TAKING_THRESHOLD, BIDDING_MARGIN, false);
    }

    /**
     * A strategy that takes a classic contract when its hand scores at least the given threshold, and that bids in
     * Contrée up to its estimate minus the given margin.
     */
    RuleBasedStrategy(int takingThreshold, int biddingMargin) {
        this(takingThreshold, biddingMargin, true);
    }

    private RuleBasedStrategy(int takingThreshold, int biddingMargin, boolean trumpControl) {
        this.takingThreshold = takingThreshold;
        this.biddingMargin = biddingMargin;
        this.trumpControl = trumpControl;
    }

    /**
     * In classic Belote, takes when its hand is strong enough in a suit it may choose. In Contrée, bids what its hand
     * is worth and supports its partner's bid.
     */
    @Override
    public AuctionDecision decideAuction(BiddingState.AuctionView view) {
        return view.variant() == GameVariant.CONTREE ? contreeDecision(view) : classicDecision(view);
    }

    /**
     * Supports its partner's bid once, in the same suit (US-035). Otherwise bids at the level of its best estimate
     * less a safety margin, rounded down to a multiple of 10: it opens when that level reaches 80, and overcalls an
     * opponent's contract when that level is higher. A failed contract gives the opponents 162 points while a made
     * one scores only the cards, so the margin (tuned in the arena) keeps bots from overbidding.
     */
    private AuctionDecision contreeDecision(BiddingState.AuctionView view) {
        if (view.partnerHoldsContract()) {
            int raise = view.hasBid() ? 0 : supportRaise(view.hand(), view.highestBidSuit());
            if (raise > 0 && view.highestBid() < MAX_BID) {
                return new AuctionDecision.Bid(Math.min(view.highestBid() + raise, MAX_BID), view.highestBidSuit());
            }
            return AuctionDecision.PASS;
        }
        GameCard.Suit best = GameCard.Suit.CLUBS;
        int bestEstimate = -1;
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            int estimate = contractEstimate(view.hand(), suit);
            if (estimate > bestEstimate) {
                best = suit;
                bestEstimate = estimate;
            }
        }
        int level = Math.min(MAX_BID, (bestEstimate - biddingMargin) / 10 * 10);
        return level >= 80 && level > view.highestBid() ? new AuctionDecision.Bid(level, best) : AuctionDecision.PASS;
    }

    /**
     * The points the bot's team can expect to make in Contrée with the given trump suit, fitted on bot play over
     * random deals: 50, plus 7 for each trump, 22 for the jack of trumps, 10 for the nine, 6 for the ace of trumps,
     * and 8 for each ace in another suit.
     */
    static int contractEstimate(List<GameCard> hand, GameCard.Suit trump) {
        int estimate = 50;
        for (GameCard card : hand) {
            if (card.suit() == trump) {
                estimate += 7;
                if (card.rank().equals("J")) estimate += 22;
                if (card.rank().equals("9")) estimate += 10;
                if (card.rank().equals("A")) estimate += 6;
            } else if (card.rank().equals("A")) {
                estimate += 8;
            }
        }
        return estimate;
    }

    /**
     * In the first round, accepts the upturned suit when its hand scores at least the threshold in that suit. In the
     * second round, chooses its best suit other than the upturned one when that suit reaches the threshold.
     */
    private AuctionDecision classicDecision(BiddingState.AuctionView view) {
        GameCard.Suit upturned = view.upturnedCard().suit();
        List<GameCard> hand = new ArrayList<>(view.hand());
        hand.add(view.upturnedCard());
        if (view.round() == 1) {
            return handScore(hand, upturned) >= takingThreshold ? new AuctionDecision.ChooseTrump(upturned)
                    : AuctionDecision.PASS;
        }
        GameCard.Suit best = null;
        int bestScore = -1;
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            int score = handScore(hand, suit);
            if (suit != upturned && score > bestScore) {
                best = suit;
                bestScore = score;
            }
        }
        return bestScore >= takingThreshold ? new AuctionDecision.ChooseTrump(best) : AuctionDecision.PASS;
    }

    /**
     * How strong a classic hand is with the given trump suit, counting the upturned card the taker receives: 3 for
     * the jack of trumps, 2 for the nine, 1 for each trump, 1 for each ace in another suit, and 1 for the belote
     * (king and queen of trumps).
     */
    static int handScore(List<GameCard> hand, GameCard.Suit trump) {
        int score = 0;
        for (GameCard card : hand) {
            if (card.suit() == trump) {
                score += 1;
                if (card.rank().equals("J")) score += 3;
                if (card.rank().equals("9")) score += 2;
            } else if (card.rank().equals("A")) {
                score += 1;
            }
        }
        if (hand.contains(new GameCard("K", trump)) && hand.contains(new GameCard("Q", trump))) score += 1;
        return score;
    }

    /**
     * How much a bot raises its partner's bid in the given suit: 20 with the jack of that suit, or with two aces
     * elsewhere and at least one card of that suit; 10 with an ace elsewhere and the nine of that suit, or with two
     * aces elsewhere and no card of that suit; otherwise 0.
     */
    public static int supportRaise(List<GameCard> hand, GameCard.Suit suit) {
        boolean jack = hand.contains(new GameCard("J", suit));
        boolean nine = hand.contains(new GameCard("9", suit));
        long otherAces = hand.stream().filter(card -> card.rank().equals("A") && card.suit() != suit).count();
        long suitCards = hand.stream().filter(card -> card.suit() == suit).count();
        if (jack || (otherAces >= 2 && suitCards > 0)) return 20;
        if ((otherAces >= 1 && nine) || otherAces >= 2) return 10;
        return 0;
    }

    /**
     * Plays to win tricks cheaply and to score them (US-053), and manages its trumps (US-054). Keeps trumps out of the
     * first trick when defending. When leading on the declaring team, leads its master trump while an opponent may
     * still hold trumps. Otherwise, when leading, cashes a master card no opponent can beat, or else leads a low card,
     * avoiding trumps and suits in which it holds the ten without the ace. When following, adds its highest-value card
     * that it does not need later (neither a trump nor a master) to a trick its partner is sure to win. Otherwise it
     * plays its cheapest card sure to win the trick; it only overtakes its partner with such a card. Against the
     * opponents, it falls back on its cheapest winning card, then on its lowest-value card. Tuned in the arena:
     * contesting every trick the opponents win beats keeping a ten out of a trick it may lose. It keeps its jack and
     * nine of trumps to regain the lead rather than win a trick worth less than 15 points with them; in the arena this
     * helps defenders as much as declarers.
     */
    @Override
    public GameCard chooseCard(GameBoard.PlayView view) {
        GameCard.Suit trump = view.trump();
        CardMemory memory = new CardMemory(view);
        List<GameCard> candidates = view.legalCards();
        if (view.tricks().isEmpty() && !view.declaring()) {
            candidates = preferring(candidates, card -> card.suit() != trump);
        }
        return view.currentTrick().isEmpty() ? lead(view, memory, candidates) : follow(view, memory, candidates);
    }

    private GameCard lead(GameBoard.PlayView view, CardMemory memory, List<GameCard> candidates) {
        GameCard.Suit trump = view.trump();
        if (trumpControl && view.declaring() && opponentsMayHoldTrumps(view, memory)) {
            Optional<GameCard> masterTrump = candidates.stream()
                    .filter(card -> card.suit() == trump && memory.master(card)).findFirst();
            if (masterTrump.isPresent()) return masterTrump.get();
        }
        Optional<GameCard> master = candidates.stream()
                .filter(card -> card.suit() != trump && holds(card, card.suit(), 3, view, memory))
                .max(byValue(trump));
        if (master.isPresent()) return master.get();
        List<GameCard> leads = preferring(candidates, card -> card.suit() != trump);
        leads = preferring(leads, card -> !tenWithoutAce(card.suit(), view, memory));
        return lowest(leads, trump, memory);
    }

    private GameCard follow(GameBoard.PlayView view, CardMemory memory, List<GameCard> candidates) {
        GameCard.Suit trump = view.trump();
        List<GameBoard.SeatCard> trick = view.currentTrick();
        GameCard.Suit lead = trick.getFirst().card().suit();
        GameBoard.SeatCard winner = trick.get(BeloteRules.winningIndex(
                trick.stream().map(GameBoard.SeatCard::card).toList(), trump));
        int playersAfter = 3 - trick.size();
        boolean partnerWins = winner.seat() % 2 == view.seat() % 2;
        if (partnerWins && holds(winner.card(), lead, playersAfter, view, memory)) {
            return candidates.stream().filter(card -> card.suit() != trump && !memory.master(card))
                    .max(byValue(trump)).orElseGet(() -> lowest(candidates, trump, memory));
        }
        List<GameCard> winning = candidates.stream()
                .filter(card -> BeloteRules.beats(card, winner.card(), lead, trump)).toList();
        if (trumpControl && trickPoints(trick, trump) < LOW_VALUE_TRICK) {
            winning = winning.stream().filter(card -> !trumpHonour(card, trump)).toList();
        }
        Optional<GameCard> sure = winning.stream()
                .filter(card -> holds(card, lead, playersAfter, view, memory)).min(byValue(trump));
        if (sure.isPresent()) return sure.get();
        if (!partnerWins && !winning.isEmpty()) return winning.stream().min(byValue(trump)).orElseThrow();
        return lowest(candidates, trump, memory);
    }

    /**
     * Whether the card, winning a trick led in the given suit, stays the winner: none of the opponents among the
     * given number of players still to play after the bot may hold a card that beats it.
     */
    private static boolean holds(GameCard winner, GameCard.Suit lead, int playersAfter, GameBoard.PlayView view,
                                 CardMemory memory) {
        for (int offset = 1; offset <= playersAfter; offset += 2) {
            if (memory.mayBeat((view.seat() + offset) % 4, winner, lead)) return false;
        }
        return true;
    }

    /** Whether an opponent who has not shown a void in trumps may still hold one. */
    private static boolean opponentsMayHoldTrumps(GameBoard.PlayView view, CardMemory memory) {
        return memory.remainingTrumps() > 0 && (!memory.shownVoid((view.seat() + 1) % 4, view.trump())
                || !memory.shownVoid((view.seat() + 3) % 4, view.trump()));
    }

    /** The jack and nine of trumps, which a bot keeps to regain the lead. */
    private static boolean trumpHonour(GameCard card, GameCard.Suit trump) {
        return card.suit() == trump && (card.rank().equals("J") || card.rank().equals("9"));
    }

    private static int trickPoints(List<GameBoard.SeatCard> trick, GameCard.Suit trump) {
        return trick.stream().mapToInt(seatCard -> BeloteRules.points(seatCard.card(), trump)).sum();
    }

    /** Whether the bot holds the ten of the suit while the ace is still in another hand. */
    private static boolean tenWithoutAce(GameCard.Suit suit, GameBoard.PlayView view, CardMemory memory) {
        return suit != view.trump() && view.hand().contains(new GameCard("10", suit))
                && memory.unseen(new GameCard("A", suit));
    }

    /** The lowest-value card, keeping masters and trumps when it can. */
    private static GameCard lowest(List<GameCard> cards, GameCard.Suit trump, CardMemory memory) {
        List<GameCard> spare = preferring(cards, card -> card.suit() != trump);
        spare = preferring(spare, card -> !memory.master(card));
        return spare.stream().min(byValue(trump)).orElseThrow();
    }

    /** Orders cards by points, then by strength within their suit. */
    private static Comparator<GameCard> byValue(GameCard.Suit trump) {
        return Comparator.comparingInt((GameCard card) -> BeloteRules.points(card, trump))
                .thenComparingInt(card -> BeloteRules.strength(card, trump));
    }

    private static List<GameCard> preferring(List<GameCard> cards, Predicate<GameCard> preferred) {
        List<GameCard> matching = cards.stream().filter(preferred).toList();
        return matching.isEmpty() ? cards : matching;
    }
}
