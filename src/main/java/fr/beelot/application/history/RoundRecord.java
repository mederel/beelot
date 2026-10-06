package fr.beelot.application.history;

import fr.beelot.game.GameBoard;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;

@Embeddable
class RoundRecord {

    @Enumerated(EnumType.STRING)
    @Column(name = "declaring_team", nullable = false)
    private Team declaringTeam;

    @Column(nullable = false)
    private String trump;

    @Column(name = "contract_value")
    private Integer contractValue;

    @Column(nullable = false)
    private boolean coinched;

    @Column(name = "contract_made", nullable = false)
    private boolean contractMade;

    @Enumerated(EnumType.STRING)
    @Column(name = "capot_team")
    private Team capotTeam;

    @Enumerated(EnumType.STRING)
    @Column(name = "belote_team")
    private Team beloteTeam;

    @Column(name = "north_south_points", nullable = false)
    private int northSouthPoints;

    @Column(name = "east_west_points", nullable = false)
    private int eastWestPoints;

    protected RoundRecord() {
    }

    RoundRecord(GameBoard.RoundSummary round) {
        GameBoard.RoundResult result = round.result();
        this.declaringTeam = Team.of(round.declaringTeam());
        this.trump = round.trump().name();
        this.contractValue = round.contractValue();
        this.coinched = round.coinched();
        this.contractMade = result.contractMade();
        this.capotTeam = Team.of(result.capotTeam());
        this.beloteTeam = result.northSouthBeloteBonus() > 0 ? Team.NORTH_SOUTH
                : result.eastWestBeloteBonus() > 0 ? Team.EAST_WEST : null;
        this.northSouthPoints = result.northSouthAwarded();
        this.eastWestPoints = result.eastWestAwarded();
    }

    Team declaringTeam() { return declaringTeam; }
    String trump() { return trump; }
    Integer contractValue() { return contractValue; }
    boolean coinched() { return coinched; }
    boolean contractMade() { return contractMade; }
    Team capotTeam() { return capotTeam; }
    Team beloteTeam() { return beloteTeam; }
    int northSouthPoints() { return northSouthPoints; }
    int eastWestPoints() { return eastWestPoints; }
}
