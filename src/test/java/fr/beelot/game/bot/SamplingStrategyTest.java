package fr.beelot.game.bot;

import fr.beelot.game.Announcement;
import fr.beelot.game.BiddingState;
import fr.beelot.game.GameBoard;
import fr.beelot.game.GameCard;
import fr.beelot.game.Trump;
import fr.beelot.game.GameVariant;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.SplittableRandom;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SamplingStrategyTest {

    private final List<GameBoard.GamePlayer> players = List.of(
            new GameBoard.GamePlayer(UUID.randomUUID(), "North"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "East"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "South"),
            new GameBoard.GamePlayer(UUID.randomUUID(), "West"));

    @Test
    void samplesDealTheUnseenCardsConsistentlyWithWhatTheBotSaw() {
        for (long seed = 1; seed <= 20; seed++) {
            GameBoard board = boardAfterTricks(seed, 4);
            if (board == null) continue;
            GameBoard.PlayView view = board.playViewFor(board.activePlayerId());
            CardMemory memory = new CardMemory(view);

            List<List<GameCard>> hands = SamplingStrategy.deal(view, memory, new SplittableRandom(seed));

            assertNotNull(hands);
            assertEquals(view.hand(), hands.get(view.seat()));
            Set<GameCard> dealt = new HashSet<>();
            for (int seat = 0; seat < 4; seat++) {
                assertEquals(8 - played(view, seat), hands.get(seat).size(), "cards held at seat " + seat);
                for (GameCard card : hands.get(seat)) {
                    assertTrue(dealt.add(card), "dealt once: " + card);
                    if (seat != view.seat()) {
                        assertTrue(memory.unseen(card), "not seen yet: " + card);
                        assertFalse(memory.shownVoid(seat, card.suit()), "no card of a suit seat " + seat + " lacks");
                    }
                }
            }
            assertEquals(new HashSet<>(memory.unseenCards()), withoutOwnHand(dealt, view));
        }
    }

    @Test
    void theSameSeedPlaysTheSameRound() {
        assertEquals(playRound(new SamplingStrategy(7)), playRound(new SamplingStrategy(7)));
    }

    @Test
    void choosesACardWithinItsTimeBudget() {
        GameBoard board = boardAfterTricks(3, 2);
        assertNotNull(board);
        GameBoard.PlayView view = board.playViewFor(board.activePlayerId());
        SamplingStrategy strategy = new SamplingStrategy(1, 1_000_000, Duration.ofMillis(50), 1);

        long start = System.nanoTime();
        GameCard card = strategy.chooseCard(view);
        long elapsedMillis = (System.nanoTime() - start) / 1_000_000;

        assertTrue(view.legalCards().contains(card));
        assertTrue(elapsedMillis < 50 + 150, "took " + elapsedMillis + " ms");
    }

    @Test
    void scoresAFailedContractAsTheDefendersWinningEverything() {
        GameBoard.PlayView view = new GameBoard.PlayView(1, List.of(), List.of(), Trump.HEARTS,
                GameVariant.CONTREE, 100, false, 0, List.of(), List.of(), false, List.of());
        List<List<GameCard>> hands = List.of(List.of(), List.of(), List.of(), List.of());

        assertEquals(162, SamplingStrategy.outcome(view, hands, 90, 72), "the declarers made 90 of their 100");
        assertEquals(52 - 110, SamplingStrategy.outcome(view, hands, 110, 52), "the declarers made their contract");
    }

    @Test
    void dealsRevealedCardsToTheirOwners() {
        GameCard.Suit spades = GameCard.Suit.SPADES;
        GameCard.Suit diamonds = GameCard.Suit.DIAMONDS;
        List<List<GameBoard.SeatCard>> tricks = List.of(
                seatCards(1, card("J", spades), card("7", spades), card("8", spades), card("9", spades)),
                seatCards(1, card("7", diamonds), card("8", diamonds), card("9", diamonds), card("10", diamonds)));
        List<GameCard> hand = List.of(card("A", GameCard.Suit.CLUBS), card("K", GameCard.Suit.CLUBS),
                card("10", GameCard.Suit.CLUBS), card("A", diamonds), card("A", GameCard.Suit.HEARTS),
                card("K", GameCard.Suit.HEARTS));
        GameBoard.PlayView view = new GameBoard.PlayView(0, hand, hand, Trump.HEARTS, GameVariant.CLASSIC, 0,
                false, 0, tricks, List.of(), true, List.of(declaration(1, false, spadeTierce())));
        CardMemory memory = new CardMemory(view);

        for (int sample = 0; sample < 200; sample++) {
            List<List<GameCard>> hands = SamplingStrategy.deal(view, memory, new SplittableRandom(sample));
            assertNotNull(hands);
            assertTrue(hands.get(1).containsAll(List.of(card("Q", spades), card("K", spades))), hands.toString());
            for (int seat = 0; seat < 4; seat++) assertEquals(6, hands.get(seat).size());
        }
    }

    @Test
    void outcomeMatchesRoundScoring() {
        List<List<GameCard>> none = List.of(List.of(), List.of(), List.of(), List.of());
        List<List<GameCard>> northBelote = List.of(List.of(card("K", GameCard.Suit.HEARTS),
                card("Q", GameCard.Suit.HEARTS)), List.of(), List.of(), List.of());
        GameBoard.PlayView classic = northView(GameVariant.CLASSIC, 0, List.of());

        assertEquals(2, SamplingStrategy.outcome(classic, none, 82, 80), "made");
        assertEquals(-162, SamplingStrategy.outcome(classic, none, 81, 81), "a tie fails");
        assertEquals(22, SamplingStrategy.outcome(classic, northBelote, 92, 70), "made thanks to the Belote");
        GameBoard.PlayView contree = northView(GameVariant.CONTREE, 100,
                List.of(declaration(0, true, spadeTierce())));
        assertEquals(110 - 72, SamplingStrategy.outcome(contree, none, 90, 72), "made thanks to the tierce");
    }

    @Test
    void unscoredDeclarationsAddNothing() {
        GameBoard.PlayView view = northView(GameVariant.CLASSIC, 0, List.of(declaration(0, false, spadeTierce())));

        assertEquals(-162, SamplingStrategy.outcome(view, List.of(List.of(), List.of(), List.of(), List.of()), 81, 81));
    }

    /** North (seat 0) took the contract and is the bot. */
    private static GameBoard.PlayView northView(GameVariant variant, int contract,
                                                List<GameBoard.Declaration> revealed) {
        return new GameBoard.PlayView(0, List.of(), List.of(), Trump.HEARTS, variant, contract, false, 0,
                List.of(), List.of(), true, revealed);
    }

    private static Announcement spadeTierce() {
        return new Announcement(Announcement.Kind.TIERCE, List.of(card("J", GameCard.Suit.SPADES),
                card("Q", GameCard.Suit.SPADES), card("K", GameCard.Suit.SPADES)), 20, GameCard.Suit.SPADES);
    }

    private static GameBoard.Declaration declaration(int seat, boolean scored, Announcement announcement) {
        return new GameBoard.Declaration(seat, "Player", seat % 2 == 0 ? "North–South" : "East–West",
                List.of(announcement), scored);
    }

    /** A completed trick led from the given seat, its cards in play order. */
    private static List<GameBoard.SeatCard> seatCards(int leader, GameCard... cards) {
        List<GameBoard.SeatCard> trick = new ArrayList<>();
        for (int index = 0; index < cards.length; index++) trick.add(new GameBoard.SeatCard((leader + index) % 4, cards[index]));
        return trick;
    }

    private static GameCard card(String rank, GameCard.Suit suit) {
        return new GameCard(rank, suit);
    }

    /** Plays a seeded Contrée deal with the strategy at every seat; returns the cards in the order played. */
    private List<GameCard> playRound(BotStrategy strategy) {
        for (long seed = 1; ; seed++) {
            BiddingState bidding = new BiddingState(players, GameVariant.CONTREE, 0, new Random(seed));
            while (bidding.completedBoard() == null && bidding.deals() == 1) {
                BotTurns.takeAuctionTurn(bidding, strategy);
            }
            GameBoard board = bidding.completedBoard();
            if (board == null) continue;
            List<GameCard> played = new ArrayList<>();
            UUID observer = players.getFirst().playerId();
            while (board.viewFor(observer).roundResult() == null) {
                if (board.viewFor(observer).reviewingCompletedTrick()) {
                    board.continueAfterTrick();
                } else {
                    GameBoard.PlayView view = board.playViewFor(board.activePlayerId());
                    GameCard card = strategy.chooseCard(view);
                    played.add(card);
                    board.play(board.activePlayerId(), card);
                }
            }
            return played;
        }
    }

    /** A seeded Contrée deal played by rule-based bots up to the given number of tricks, or null if redealt. */
    private GameBoard boardAfterTricks(long seed, int tricks) {
        RuleBasedStrategy rules = new RuleBasedStrategy();
        BiddingState bidding = new BiddingState(players, GameVariant.CONTREE, 0, new Random(seed));
        while (bidding.completedBoard() == null && bidding.deals() == 1) BotTurns.takeAuctionTurn(bidding, rules);
        GameBoard board = bidding.completedBoard();
        if (board == null) return null;
        while (board.playViewFor(board.activePlayerId()).tricks().size() < tricks
                || board.viewFor(players.getFirst().playerId()).reviewingCompletedTrick()) {
            if (board.viewFor(players.getFirst().playerId()).reviewingCompletedTrick()) board.continueAfterTrick();
            else BotTurns.playTurn(board, rules);
        }
        return board;
    }

    private static int played(GameBoard.PlayView view, int seat) {
        int count = (int) view.currentTrick().stream().filter(card -> card.seat() == seat).count();
        for (List<GameBoard.SeatCard> trick : view.tricks()) {
            count += (int) trick.stream().filter(card -> card.seat() == seat).count();
        }
        return count;
    }

    private static Set<GameCard> withoutOwnHand(Set<GameCard> dealt, GameBoard.PlayView view) {
        Set<GameCard> others = new HashSet<>(dealt);
        view.hand().forEach(others::remove);
        return others;
    }
}
