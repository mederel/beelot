package fr.beelot.game.bot;

import fr.beelot.game.BeloteRules;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;

import java.util.ArrayList;
import java.util.List;

/**
 * Finds the best play of a round when all four hands are known (a double-dummy solver): North–South maximise their
 * points and East–West minimise them, by alpha-beta search with a transposition table at the start of each trick.
 * The result counts the card points, the last-trick bonus (dix de der) and the belote. A solver keeps its table
 * between calls, so an instance must not be shared between threads.
 */
public final class DoubleDummySolver {

    private static final String[] RANKS = {"7", "8", "9", "10", "J", "Q", "K", "A"};
    private static final int TABLE_BITS = 20;
    private static final int TABLE_SIZE = 1 << TABLE_BITS;
    private static final int UNKNOWN = -1;
    private static final int KEY_BITS = 34;

    private final long[] tableKeys = new long[TABLE_SIZE];
    private final short[] tableLower = new short[TABLE_SIZE];
    private final short[] tableUpper = new short[TABLE_SIZE];

    // The card at bit (8 × suit + n) is the n-th weakest card of that suit under the current trump.
    private final GameCard[] cards = new GameCard[32];
    private final int[] points = new int[32];
    private final int[] hands = new int[4];
    private final int[] trick = new int[4];
    private int trumpSuit;
    private long nodes;
    // Table entries carry the number of the solve that wrote them, so the table never needs clearing.
    private long generation;

    /**
     * A round in progress: the cards each seat still holds (seats numbered in play order from 0, North–South
     * holding the even seats), the trump suit, the completed tricks, the cards of the trick being played, and the
     * seat that led the first trick.
     */
    public record Position(List<List<GameCard>> hands, GameCard.Suit trump, List<List<GameBoard.SeatCard>> tricks,
                           List<GameBoard.SeatCard> currentTrick, int firstLeader) {

        public Position {
            hands = hands.stream().map(List::copyOf).toList();
            tricks = tricks.stream().map(List::copyOf).toList();
            currentTrick = List.copyOf(currentTrick);
            if (hands.size() != 4) throw new IllegalArgumentException("A position needs four hands.");
        }

        /** A round before its first card, led by the given seat. */
        public static Position start(List<List<GameCard>> hands, GameCard.Suit trump, int leader) {
            return new Position(hands, trump, List.of(), List.of(), leader);
        }
    }

    /**
     * The points each team scores when both play their best from the position, counting the points already won, and
     * a card that achieves it for the seat to play (null once the round is over).
     */
    public record Solution(int northSouthPoints, int eastWestPoints, GameCard bestCard) {
    }

    public Solution solve(Position position) {
        prepare(position.trump());
        for (int seat = 0; seat < 4; seat++) hands[seat] = mask(position.hands().get(seat));
        int[] won = pointsWon(position);
        int belote = beloteSeat(position);
        int northSouthBelote = belote >= 0 && belote % 2 == 0 ? 20 : 0;
        int eastWestBelote = belote >= 0 && belote % 2 == 1 ? 20 : 0;

        List<GameBoard.SeatCard> current = position.currentTrick();
        int remaining = hands[0] | hands[1] | hands[2] | hands[3];
        int remainingPoints = pointsOf(remaining) + (remaining == 0 ? 0 : 10);
        for (GameBoard.SeatCard played : current) remainingPoints += points[index(played.card())];
        GameCard best = null;
        int value = 0;
        if (remaining != 0) {
            int leader = current.isEmpty() ? leaderOf(position) : current.getFirst().seat();
            for (int pos = 0; pos < current.size(); pos++) trick[pos] = index(current.get(pos).card());
            int[] bestIndex = {UNKNOWN};
            value = play(current.size(), leader, 0, remainingPoints, bestIndex);
            best = cards[bestIndex[0]];
        }
        int northSouth = won[0] + value + northSouthBelote;
        int eastWest = won[1] + remainingPoints - value + eastWestBelote;
        return new Solution(northSouth, eastWest, best);
    }

    /** Positions searched by the last calls, for benchmarks. */
    public long nodes() {
        return nodes;
    }

    private void prepare(GameCard.Suit trump) {
        trumpSuit = trump.ordinal();
        for (GameCard.Suit suit : GameCard.Suit.values()) {
            for (String rank : RANKS) {
                GameCard card = new GameCard(rank, suit);
                int bit = 8 * suit.ordinal() + BeloteRules.strength(card, trump);
                cards[bit] = card;
                points[bit] = BeloteRules.points(card, trump);
            }
        }
        generation++;
    }

    /**
     * The best North–South points from the remaining cards, with {@code position} cards already in the trick led by
     * {@code leader}. When {@code bestIndex} is given, it receives the best card for the seat to play.
     */
    private int play(int position, int leader, int alpha, int beta, int[] bestIndex) {
        nodes++;
        int seat = (leader + position) & 3;
        int moves = legal(seat, position);
        boolean northSouth = (seat & 1) == 0;
        int best = northSouth ? Integer.MIN_VALUE : Integer.MAX_VALUE;
        while (moves != 0) {
            int card = 31 - Integer.numberOfLeadingZeros(moves);
            moves &= ~(1 << card);
            hands[seat] &= ~(1 << card);
            trick[position] = card;
            int value;
            if (position < 3) {
                value = play(position + 1, leader, alpha, beta, null);
            } else {
                int winner = (leader + winningPosition(4)) & 3;
                int remaining = hands[0] | hands[1] | hands[2] | hands[3];
                int trickPoints = points[trick[0]] + points[trick[1]] + points[trick[2]] + points[trick[3]]
                        + (remaining == 0 ? 10 : 0);
                int gain = (winner & 1) == 0 ? trickPoints : 0;
                if (remaining == 0) {
                    value = gain;
                } else {
                    // The next trick reuses the trick buffer: keep this trick's cards for the remaining moves.
                    int first = trick[0];
                    int second = trick[1];
                    int third = trick[2];
                    value = gain + startTrick(winner, alpha - gain, beta - gain);
                    trick[0] = first;
                    trick[1] = second;
                    trick[2] = third;
                }
            }
            hands[seat] |= 1 << card;
            if (northSouth ? value > best : value < best) {
                best = value;
                if (bestIndex != null) bestIndex[0] = card;
            }
            if (northSouth) alpha = Math.max(alpha, value);
            else beta = Math.min(beta, value);
            if (alpha >= beta) break;
        }
        return best;
    }

    /** The best North–South points from the remaining cards when the given seat leads the next trick. */
    private int startTrick(int leader, int alpha, int beta) {
        int remaining = hands[0] | hands[1] | hands[2] | hands[3];
        long key = (generation << KEY_BITS) | (Integer.toUnsignedLong(remaining) << 2) | leader;
        int slot = (int) ((key * 0x9E3779B97F4A7C15L) >>> (64 - TABLE_BITS));
        int lower = 0;
        int upper = pointsOf(remaining) + 10;
        if (tableKeys[slot] == key) {
            lower = tableLower[slot];
            upper = tableUpper[slot];
        }
        // Cutting off here also keeps the search window below non-empty, so its result is an unambiguous bound.
        if (lower >= beta || lower == upper) return lower;
        if (upper <= alpha) return upper;
        int low = Math.max(alpha, lower);
        int high = Math.min(beta, upper);
        int value = play(0, leader, low, high, null);
        if (value <= low) upper = value;
        else if (value >= high) lower = value;
        else lower = upper = value;
        tableKeys[slot] = key;
        tableLower[slot] = (short) lower;
        tableUpper[slot] = (short) upper;
        return value;
    }

    /** The cards the seat may play, as in {@link BeloteRules#legalCards}, on the bits of this solver. */
    private int legal(int seat, int position) {
        int hand = hands[seat];
        if (position == 0) return hand;
        int leadSuit = trick[0] >> 3;
        int winner = winningPosition(position);
        int winningCard = trick[winner];
        int follow = hand & suitMask(leadSuit);
        if (follow != 0) {
            if (leadSuit != trumpSuit) return follow;
            int higher = follow & above(winningCard);
            return higher != 0 ? higher : follow;
        }
        if (winner == position - 2) return hand;
        int trumps = hand & suitMask(trumpSuit);
        if (trumps == 0) return hand;
        if (winningCard >> 3 != trumpSuit) return trumps;
        int higher = trumps & above(winningCard);
        return higher != 0 ? higher : trumps;
    }

    private int winningPosition(int size) {
        int winner = 0;
        for (int pos = 1; pos < size; pos++) {
            int contender = trick[pos];
            int current = trick[winner];
            boolean sameSuit = contender >> 3 == current >> 3;
            if (sameSuit ? contender > current : contender >> 3 == trumpSuit) winner = pos;
        }
        return winner;
    }

    /** The cards of the same suit stronger than the given card. */
    private static int above(int card) {
        int higherBits = card == 31 ? 0 : -1 << (card + 1);
        return higherBits & suitMask(card >> 3);
    }

    private static int suitMask(int suit) {
        return 0xFF << (8 * suit);
    }

    private int pointsOf(int mask) {
        int total = 0;
        while (mask != 0) {
            int card = Integer.numberOfTrailingZeros(mask);
            total += points[card];
            mask &= mask - 1;
        }
        return total;
    }

    private int index(GameCard card) {
        return 8 * card.suit().ordinal() + BeloteRules.strength(card, GameCard.Suit.values()[trumpSuit]);
    }

    private int mask(List<GameCard> hand) {
        int mask = 0;
        for (GameCard card : hand) mask |= 1 << index(card);
        return mask;
    }

    /** Points each team has already won in the completed tricks, with the dix de der once all are played. */
    private int[] pointsWon(Position position) {
        int[] won = new int[2];
        GameCard.Suit trump = position.trump();
        List<List<GameBoard.SeatCard>> tricks = position.tricks();
        for (int number = 0; number < tricks.size(); number++) {
            List<GameBoard.SeatCard> completed = tricks.get(number);
            List<GameCard> trickCards = completed.stream().map(GameBoard.SeatCard::card).toList();
            int winner = completed.get(BeloteRules.winningIndex(trickCards, trump)).seat();
            int trickPoints = trickCards.stream().mapToInt(card -> BeloteRules.points(card, trump)).sum();
            if (number == 7) trickPoints += 10;
            won[winner & 1] += trickPoints;
        }
        return won;
    }

    private int leaderOf(Position position) {
        if (position.tricks().isEmpty()) return position.firstLeader();
        List<GameBoard.SeatCard> last = position.tricks().getLast();
        return last.get(BeloteRules.winningIndex(last.stream().map(GameBoard.SeatCard::card).toList(),
                position.trump())).seat();
    }

    /** The seat dealt both the king and the queen of trumps, or -1. */
    private static int beloteSeat(Position position) {
        GameCard king = new GameCard("K", position.trump());
        GameCard queen = new GameCard("Q", position.trump());
        for (int seat = 0; seat < 4; seat++) {
            List<GameCard> dealt = new ArrayList<>(position.hands().get(seat));
            for (List<GameBoard.SeatCard> completed : position.tricks()) {
                for (GameBoard.SeatCard played : completed) if (played.seat() == seat) dealt.add(played.card());
            }
            for (GameBoard.SeatCard played : position.currentTrick()) if (played.seat() == seat) dealt.add(played.card());
            if (dealt.contains(king) && dealt.contains(queen)) return seat;
        }
        return -1;
    }
}
