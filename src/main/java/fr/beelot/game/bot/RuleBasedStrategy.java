package fr.beelot.game.bot;

import fr.beelot.game.BeloteRules;
import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.GameVariant;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;

/**
 * The bot players meet in the application: hand-written card-play rules (US-033 to US-037) and bidding rules (US-050,
 * US-051).
 */
public final class RuleBasedStrategy implements BotStrategy {

    private static final int MAX_BID = 160;
    static final int TAKING_THRESHOLD = 6;
    static final int BIDDING_MARGIN = 15;

    private final int takingThreshold;
    private final int biddingMargin;

    public RuleBasedStrategy() {
        this(TAKING_THRESHOLD, BIDDING_MARGIN);
    }

    /**
     * A strategy that takes a classic contract when its hand scores at least the given threshold, and that bids in
     * Contrée up to its estimate minus the given margin.
     */
    RuleBasedStrategy(int takingThreshold, int biddingMargin) {
        this.takingThreshold = takingThreshold;
        this.biddingMargin = biddingMargin;
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
     * Cashes an ace likely to be trumped the next time its suit is played. Keeps trumps out of the first trick when
     * defending, and aces out of a trick the opponents have already won with a trump. When the opponents win the
     * trick, the bot cannot beat them and its partner has already played, the bot plays its lowest-value card.
     * Otherwise it plays its first legal card.
     */
    @Override
    public GameCard chooseCard(GameBoard.PlayView view) {
        GameCard.Suit trump = view.trump();
        List<GameCard> candidates = view.legalCards();
        if (view.tricks().isEmpty() && !view.declaring()) {
            candidates = preferring(candidates, card -> card.suit() != trump);
        }
        List<GameBoard.SeatCard> trick = view.currentTrick();
        if (trick.isEmpty()) {
            return candidates.stream().filter(card -> aceAtRisk(card, view)).findFirst().orElse(candidates.getFirst());
        }
        GameCard.Suit lead = trick.getFirst().card().suit();
        GameBoard.SeatCard winner = trick.get(BeloteRules.winningIndex(
                trick.stream().map(GameBoard.SeatCard::card).toList(), trump));
        if (winner.card().suit() != trump) {
            GameCard ace = new GameCard("A", lead);
            if (candidates.contains(ace) && aceAtRisk(ace, view)) return ace;
        }
        boolean opponentsWin = winner.seat() % 2 != view.seat() % 2;
        boolean opponentsTrumped = winner.card().suit() == trump && opponentsWin;
        boolean canWin = candidates.stream().anyMatch(card -> BeloteRules.beats(card, winner.card(), lead, trump));
        if (opponentsTrumped && !canWin) candidates = preferring(candidates, card -> !card.rank().equals("A"));
        boolean partnerPlayed = trick.size() >= 2;
        if (opponentsWin && partnerPlayed && !canWin) {
            return candidates.stream().min(Comparator.comparingInt((GameCard card) -> BeloteRules.points(card, trump))
                    .thenComparingInt(card -> BeloteRules.strength(card, trump))).orElseThrow();
        }
        return candidates.getFirst();
    }

    /**
     * Whether the bot's ace risks being trumped the next time its suit is played: trumps may remain, and an
     * opponent has shown a void in the suit or at most two cards of the suit are still unseen.
     */
    private static boolean aceAtRisk(GameCard card, GameBoard.PlayView view) {
        GameCard.Suit trump = view.trump();
        if (!card.rank().equals("A") || card.suit() == trump || unseenCards(trump, view) == 0) return false;
        List<Set<GameCard.Suit>> voids = shownVoids(view);
        boolean opponentShownVoid = false;
        for (int seat = 0; seat < voids.size(); seat++) {
            if (seat % 2 != view.seat() % 2 && voids.get(seat).contains(card.suit()) && !voids.get(seat).contains(trump)) {
                opponentShownVoid = true;
            }
        }
        return opponentShownVoid || unseenCards(card.suit(), view) <= 2;
    }

    /** The suits each seat has shown it lacks, by not following the suit led. */
    private static List<Set<GameCard.Suit>> shownVoids(GameBoard.PlayView view) {
        List<Set<GameCard.Suit>> voids = new ArrayList<>();
        for (int seat = 0; seat < 4; seat++) voids.add(EnumSet.noneOf(GameCard.Suit.class));
        for (List<GameBoard.SeatCard> trick : playedTricks(view)) {
            GameCard.Suit lead = trick.getFirst().card().suit();
            for (GameBoard.SeatCard played : trick) {
                if (played.card().suit() != lead) voids.get(played.seat()).add(lead);
            }
        }
        return voids;
    }

    /** Cards of the suit the bot has neither in its hand nor seen played. */
    private static long unseenCards(GameCard.Suit suit, GameBoard.PlayView view) {
        long played = playedTricks(view).stream().flatMap(List::stream)
                .filter(seatCard -> seatCard.card().suit() == suit).count();
        return 8 - view.hand().stream().filter(card -> card.suit() == suit).count() - played;
    }

    private static List<List<GameBoard.SeatCard>> playedTricks(GameBoard.PlayView view) {
        List<List<GameBoard.SeatCard>> tricks = new ArrayList<>(view.tricks());
        if (!view.currentTrick().isEmpty()) tricks.add(view.currentTrick());
        return tricks;
    }

    private static List<GameCard> preferring(List<GameCard> cards, Predicate<GameCard> preferred) {
        List<GameCard> matching = cards.stream().filter(preferred).toList();
        return matching.isEmpty() ? cards : matching;
    }
}
