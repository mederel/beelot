package fr.beelot.game.arena;

import fr.beelot.game.BeloteRules;
import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.bot.AuctionDecision;
import fr.beelot.game.bot.BotStrategy;
import fr.beelot.game.bot.RuleBasedStrategy;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import java.util.random.RandomGenerator;

/**
 * Reference bot: bids like the current bot, but plays its cards as bots did before US-053 (the rules of US-033 to
 * US-037). When no rule applies, it plays its first legal card.
 */
final class PreviousPlayBot implements ArenaBot {

    private final BotStrategy bidding = new RuleBasedStrategy();

    @Override
    public String name() {
        return "previous-play";
    }

    @Override
    public AuctionDecision decideAuction(BiddingState.AuctionView view, RandomGenerator random) {
        return bidding.decideAuction(view);
    }

    /**
     * Cashes an ace likely to be trumped the next time its suit is played. Keeps trumps out of the first trick when
     * defending, and aces out of a trick the opponents have already won with a trump. When the opponents win the
     * trick, the bot cannot beat them and its partner has already played, the bot plays its lowest-value card.
     * Otherwise it plays its first legal card.
     */
    @Override
    public GameCard chooseCard(GameBoard.PlayView view, RandomGenerator random) {
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
