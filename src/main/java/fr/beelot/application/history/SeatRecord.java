package fr.beelot.application.history;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;

import java.util.UUID;

@Embeddable
class SeatRecord {

    @Column(name = "account_id")
    private UUID accountId;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Team team;

    @Column(nullable = false)
    private boolean bot;

    protected SeatRecord() {
    }

    SeatRecord(UUID accountId, String name, Team team, boolean bot) {
        this.accountId = accountId;
        this.name = name;
        this.team = team;
        this.bot = bot;
    }

    UUID accountId() { return accountId; }
    String name() { return name; }
    Team team() { return team; }
    boolean bot() { return bot; }
}
