package fr.beelot.game;

import fr.beelot.game.Announcement.Kind;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.OptionalInt;

/**
 * Finds the announcements of a hand and the best of a round's declarations (US-060). Carrés come first: sequences
 * are formed from the cards left over, so a card counts in one announcement at most.
 */
public final class Announcements {

    /** The order of sequences, whatever the trump; also the order of top cards when announcements are compared. */
    private static final List<String> SEQUENCE_ORDER = List.of("7", "8", "9", "10", "J", "Q", "K", "A");
    private static final Map<String, Integer> CARRE_VALUES = Map.of("J", 200, "9", 150, "A", 100, "10", 100,
            "K", 100, "Q", 100);

    private Announcements() {
    }

    /** A seat's declared announcements. */
    public record Declared(int seat, List<Announcement> announcements) {
    }

    /** Every announcement of the hand, strongest first. */
    public static List<Announcement> find(List<GameCard> hand) {
        List<Announcement> found = new ArrayList<>();
        List<GameCard> left = new ArrayList<>(hand);
        for (Map.Entry<String, Integer> carre : CARRE_VALUES.entrySet()) {
            List<GameCard> four = left.stream().filter(card -> card.rank().equals(carre.getKey())).toList();
            if (four.size() == 4) {
                found.add(new Announcement(Kind.CARRE, four, carre.getValue(), null));
                left.removeAll(four);
            }
        }
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            List<GameCard> run = new ArrayList<>();
            for (String rank : SEQUENCE_ORDER) {
                GameCard card = new GameCard(rank, suit);
                if (left.contains(card)) {
                    run.add(card);
                } else {
                    addSequence(found, run, suit);
                    run = new ArrayList<>();
                }
            }
            addSequence(found, run, suit);
        }
        found.sort(strength(null).reversed());
        return List.copyOf(found);
    }

    /**
     * Weakest first: the value, then the length of the run (a carré counts 4), then the top card, then the trump
     * suit. Declaring first, the last tie-break, depends on the round and is left to {@link #bestSeat}.
     */
    public static Comparator<Announcement> strength(GameCard.Suit trump) {
        return Comparator.comparingInt(Announcement::value)
                .thenComparingInt(announcement -> announcement.cards().size())
                .thenComparingInt(announcement -> rankHeight(announcement.topCard().rank()))
                .thenComparing(announcement -> trump != null && announcement.suit() == trump);
    }

    /** The seat holding the strongest announcement; on a full tie, the one that declared first. */
    public static OptionalInt bestSeat(List<Declared> inDeclarationOrder, GameCard.Suit trump) {
        Comparator<Announcement> strength = strength(trump);
        Declared best = null;
        Announcement bestAnnouncement = null;
        for (Declared declared : inDeclarationOrder) {
            for (Announcement announcement : declared.announcements()) {
                if (bestAnnouncement == null || strength.compare(announcement, bestAnnouncement) > 0) {
                    best = declared;
                    bestAnnouncement = announcement;
                }
            }
        }
        return best == null ? OptionalInt.empty() : OptionalInt.of(best.seat());
    }

    static int rankHeight(String rank) {
        return SEQUENCE_ORDER.indexOf(rank);
    }

    private static void addSequence(List<Announcement> found, List<GameCard> run, GameCard.Suit suit) {
        if (run.size() < 3) return;
        Kind kind = run.size() == 3 ? Kind.TIERCE : run.size() == 4 ? Kind.CINQUANTE : Kind.CENT;
        int value = switch (kind) {
            case TIERCE -> 20;
            case CINQUANTE -> 50;
            default -> 100;
        };
        found.add(new Announcement(kind, run, value, suit));
    }
}
