package fr.beelot.application.history;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** A finished match with at least one signed-in player, as stored in the history. */
@Entity
@Table(name = "match_record")
class MatchRecord {

    @Id
    private UUID id;

    @Column(name = "ended_at", nullable = false)
    private Instant endedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private FinishedMatch.Mode mode;

    @Column(nullable = false)
    private String variant;

    private String difficulty;

    @Column(name = "north_south_score", nullable = false)
    private int northSouthScore;

    @Column(name = "east_west_score", nullable = false)
    private int eastWestScore;

    @Enumerated(EnumType.STRING)
    @Column(name = "winning_team", nullable = false)
    private Team winningTeam;

    @ElementCollection
    @CollectionTable(name = "match_seat", joinColumns = @JoinColumn(name = "match_id"))
    @OrderColumn(name = "position")
    private List<SeatRecord> seats = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "match_round", joinColumns = @JoinColumn(name = "match_id"))
    @OrderColumn(name = "round_index")
    private List<RoundRecord> rounds = new ArrayList<>();

    protected MatchRecord() {
    }

    MatchRecord(FinishedMatch match, List<SeatRecord> seats) {
        this.id = match.id();
        this.endedAt = match.endedAt();
        this.mode = match.mode();
        this.variant = match.variant().name();
        this.difficulty = match.difficulty() == null ? null : match.difficulty().name();
        this.northSouthScore = match.northSouthScore();
        this.eastWestScore = match.eastWestScore();
        this.winningTeam = Team.of(match.winningTeam());
        this.seats = new ArrayList<>(seats);
        this.rounds = new ArrayList<>(match.rounds().stream().map(RoundRecord::new).toList());
    }

    UUID id() { return id; }
    Instant endedAt() { return endedAt; }
    FinishedMatch.Mode mode() { return mode; }
    String variant() { return variant; }
    String difficulty() { return difficulty; }
    int northSouthScore() { return northSouthScore; }
    int eastWestScore() { return eastWestScore; }
    Team winningTeam() { return winningTeam; }
    List<SeatRecord> seats() { return List.copyOf(seats); }
    List<RoundRecord> rounds() { return List.copyOf(rounds); }
}
