<script lang="ts">
  // The rules reference (US-123): the same text in the help sheet and at /rules. `order` puts the card order first.
  import { t } from "$lib/i18n/i18n.svelte";
  import PlayingCard from "$lib/cards/PlayingCard.svelte";

  const trumpOrder = ["J", "9", "A", "10", "K", "Q", "8", "7"];
  const plainOrder = ["A", "10", "K", "Q", "J", "9", "8", "7"];
</script>

<div class="rules">
  <section class="order">
    <h3>{t("Card order")}</h3>
    <p>{t("At trump: jack, 9, ace, 10, king, queen, 8, 7. In other suits: ace, 10, king, queen, jack, 9, 8, 7.")}</p>
    <div class="strip" aria-hidden="true">
      {#each trumpOrder as rank (rank)}<PlayingCard card={{ rank, suit: "HEARTS" }} label={false} />{/each}
    </div>
    <div class="strip" aria-hidden="true">
      {#each plainOrder as rank (rank)}<PlayingCard card={{ rank, suit: "SPADES" }} label={false} />{/each}
    </div>
  </section>
  <p class="lead">{t("Classic suit-trump Belote, played to 1,000 points. Tout-Atout and Sans-Atout are not part of this variant.")}</p>
  <section>
    <h3>{t("Deal and trump")}</h3>
    <p>{t("Each player receives five cards and one card is turned face up. First, accept that suit or pass. After all pass, choose another suit; a second all-pass redeals.")}</p>
  </section>
  <section>
    <h3>{t("Announcements")}</h3>
    <p>{t("Declare tierce (three cards in a row, 20), cinquante (four, 50), cent (five or more, 100) and carrés (jacks 200, nines 150, aces, tens, kings or queens 100) when you play your first card. Sequences follow 7, 8, 9, 10, jack, queen, king, ace in one suit; a card counts once, carrés first. Only the team with the best announcement scores, and it scores all of its own: the higher value wins, then the longer run, then the higher card, then trump, then whoever declared first. Belote and announcements count towards the contract.")}</p>
  </section>
  <section>
    <h3>{t("Playing a card")}</h3>
    <p>{t("Follow the lead suit when possible. If void and an opponent wins, trump and overtrump when able. If your partner wins, you may discard.")}</p>
  </section>
  <section>
    <h3>{t("Scoring")}</h3>
    <p>{t("Card points total 162, including 10 points for the last trick (Dix de der). King and queen of trump declare Belote/Rebelote for 20 points. The declaring team must score more than its opponents, counting Belote and announcements.")}</p>
    <p>{t("A team that takes every trick makes a capot and scores 250 instead of 162. In Contrée, the bid is added to the team that wins the contract: the bidders if they make it, their opponents if they fail.")}</p>
    <p>{t("The first team to reach the match target (1,000 points in Classic Belote and 2,000 in Contrée, unless the players choose 500, 1,000, 1,500 or 2,000) wins the match. When both teams reach it in the same round, the higher score wins; an exact tie is settled by another round.")}</p>
  </section>
  <section>
    <h3>{t("Contrée variant")}</h3>
    <p>{t("All eight cards are dealt before an auction from 80 to 160, in steps of 10. Each call names a trump suit and must raise the current contract. Three passes after a bid close the auction. An opponent may coinche, doubling the round score; Belote/Rebelote remains active.")}</p>
  </section>
  <section>
    <h3>{t("Bela variant")}</h3>
    <p>{t("Bela, as played in Croatia, Bosnia and Serbia, deals six cards to each player. Starting left of the dealer, each player names the trump suit or says dalje (pass); the first to name a suit calls it and two more cards are dealt to everyone. The dealer may not pass.")}</p>
    <p>{t("Declarations (zvanje) are always played, with the same values as the announcements above, and the king and queen of trumps are the bela, 20 points. The calling team must score more than its opponents, or it is pad: the opponents score all 162 points and every declaration. A team that takes all eight tricks makes štiglja and scores 252. Bela is played to 1,000 points by default.")}</p>
  </section>
  <section>
    <h3>{t("Tout-atout and sans-atout")}</h3>
    <p>{t("Besides the four suits, a Contrée bid can name sans-atout (no trumps) or tout-atout (all trumps) when the table plays them. A bid must be higher in value whatever the contract. Nothing is cut in either contract: follow the lead suit when you can, otherwise play any card. In tout-atout you must also beat the winning card when you can.")}</p>
    <p>{t("Sans-atout card points: Ace 19, 10 10, King 4, Queen 3, Jack 2, 9, 8 and 7 0. Order: ace, 10, king, queen, jack, 9, 8, 7. The cards total 162 with the 10 points for the last trick (Dix de der).")}</p>
    <p>{t("Tout-atout card points: Jack 13, 9 9, Ace 6, 10 5, King 3, Queen 2, 8 and 7 0. Order in every suit: jack, 9, ace, 10, king, queen, 8, 7. The cards total 162 with the 10 points for the last trick (Dix de der).")}</p>
    <p>{t("In tout-atout, Belote/Rebelote can be declared in every suit; sans-atout has none. Sans-atout carrés score aces 200, tens 150, and kings, queens, jacks or nines 100.")}</p>
  </section>
</div>

<style>
  .rules {
    display: grid;
    gap: 1.1rem;
    min-width: 0;
  }
  .rules > * {
    min-width: 0;
  }
  h3 {
    margin-bottom: 0.35rem;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--color-honey-300);
  }
  p {
    color: rgb(246 243 255 / 0.85);
    line-height: 1.55;
    font-size: 0.95rem;
  }
  p + p {
    margin-top: 0.5rem;
  }
  .lead {
    color: var(--color-muted);
  }
  .order {
    padding: 1rem;
    border-radius: 1.2rem;
    background: rgb(255 194 46 / 0.08);
    border: 1px solid rgb(255 194 46 / 0.2);
  }
  .strip {
    --cw: 2.6rem;
    display: flex;
    gap: 0.2rem;
    margin-top: 0.6rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
  }
  .strip :global(.face) {
    flex: none;
  }
</style>
