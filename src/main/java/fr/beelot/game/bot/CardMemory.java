package fr.beelot.game.bot;

import fr.beelot.game.BeloteRules;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.Trump;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * What a bot remembers of the cards played so far, from its player's view: the cards it has not seen, which cards
 * are masters, how many trumps remain, which suits each player has shown to be void in, and which cards the other
 * players revealed with their announcements and still hold (US-061).
 */
final class CardMemory {

    private static final List<String> RANKS = List.of("7", "8", "9", "10", "J", "Q", "K", "A");

    private final Trump trump;
    private final Set<GameCard> unseen = new HashSet<>();
    private final List<Set<GameCard.Suit>> voids = new ArrayList<>();
    private final List<Set<GameCard>> known = new ArrayList<>();

    CardMemory(GameBoard.PlayView view) {
        trump = Trump.of(view.trump());
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : RANKS) unseen.add(new GameCard(rank, suit));
        }
        view.hand().forEach(unseen::remove);
        for (int seat = 0; seat < 4; seat++) {
            voids.add(EnumSet.noneOf(GameCard.Suit.class));
            known.add(new HashSet<>());
        }
        for (GameBoard.Declaration declaration : view.revealedAnnouncements()) {
            if (declaration.seat() == view.seat()) continue;
            declaration.announcements().forEach(announcement -> known.get(declaration.seat()).addAll(announcement.cards()));
        }
        List<List<GameBoard.SeatCard>> tricks = new ArrayList<>(view.tricks());
        if (!view.currentTrick().isEmpty()) tricks.add(view.currentTrick());
        tricks.forEach(this::remember);
    }

    /**
     * A player who does not follow the suit led is void in it. A player who neither follows nor trumps, while the
     * opponents are winning the trick, is also void in trumps, since the rules would have forced a trump.
     */
    private void remember(List<GameBoard.SeatCard> trick) {
        GameCard.Suit lead = trick.getFirst().card().suit();
        List<GameCard> played = new ArrayList<>();
        for (GameBoard.SeatCard seatCard : trick) {
            GameCard card = seatCard.card();
            unseen.remove(card);
            known.get(seatCard.seat()).remove(card);
            if (card.suit() != lead) {
                voids.get(seatCard.seat()).add(lead);
                boolean partnerWinning = BeloteRules.winningIndex(played, trump) == played.size() - 2;
                if (!trump.isTrump(card.suit()) && !partnerWinning) voids.get(seatCard.seat()).add(trump.suit());
            }
            played.add(card);
        }
    }

    /** Whether the card is neither in the bot's hand nor played yet, so another player may hold it. */
    boolean unseen(GameCard card) {
        return unseen.contains(card);
    }

    /** The cards neither in the bot's hand nor played yet, in a fixed order: by suit, then by rank. */
    List<GameCard> unseenCards() {
        List<GameCard> cards = new ArrayList<>();
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : RANKS) {
                GameCard card = new GameCard(rank, suit);
                if (unseen.contains(card)) cards.add(card);
            }
        }
        return cards;
    }

    /** Unseen cards of the suit. */
    int unseenCount(GameCard.Suit suit) {
        return (int) unseen.stream().filter(card -> card.suit() == suit).count();
    }

    /** Trumps still held by the other players. */
    int remainingTrumps() {
        return unseenCount(trump.suit());
    }

    /** Whether no unseen card of the card's suit beats it. */
    boolean master(GameCard card) {
        return unseen.stream().noneMatch(other -> other.suit() == card.suit()
                && BeloteRules.strength(other, trump) > BeloteRules.strength(card, trump));
    }

    /** The cards the player at the seat revealed with an announcement and has not played yet; none for the bot. */
    Set<GameCard> knownCards(int seat) {
        return Set.copyOf(known.get(seat));
    }

    /** Whether the card is known to be in the hand of a player other than the one at the seat. */
    boolean knownElsewhere(GameCard card, int seat) {
        for (int other = 0; other < 4; other++) if (other != seat && known.get(other).contains(card)) return true;
        return false;
    }

    boolean shownVoid(int seat, GameCard.Suit suit) {
        return voids.get(seat).contains(suit);
    }

    /**
     * Whether the player at the seat may still hold an unseen card that beats the given card on a trick led in the
     * given suit. A player is only expected to trump once shown void in the suit led, or once no card of it is
     * unseen: fearing a trump earlier made bots lose points in the arena. A card known to be in another hand doesn't
     * count.
     */
    boolean mayBeat(int seat, GameCard winner, GameCard.Suit lead) {
        boolean mayTrump = !trump.isTrump(winner.suit()) && !shownVoid(seat, trump.suit())
                && unseen.stream().anyMatch(other -> trump.isTrump(other.suit()) && !knownElsewhere(other, seat))
                && (shownVoid(seat, lead) || unseenCount(lead) == 0);
        if (mayTrump) return true;
        return !shownVoid(seat, winner.suit()) && unseen.stream().anyMatch(other -> other.suit() == winner.suit()
                && !knownElsewhere(other, seat)
                && BeloteRules.strength(other, trump) > BeloteRules.strength(winner, trump));
    }
}
