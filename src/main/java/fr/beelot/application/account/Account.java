package fr.beelot.application.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** A player with a passkey, known only by a random id and a pseudonym (US-084). */
@Entity
@Table(name = "account")
public class Account {

    @Id
    private UUID id;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_sign_in_at", nullable = false)
    private Instant lastSignInAt;

    /** The sign-in before the latest one, shown to the player to spot an access they did not make (US-077). */
    @Column(name = "previous_sign_in_at")
    private Instant previousSignInAt;

    protected Account() {
    }

    Account(String displayName, Instant now) {
        this(UUID.randomUUID(), displayName, now);
    }

    /** An account with the given id, which sign-up chooses before the passkey is made. */
    Account(UUID id, String displayName, Instant now) {
        this.id = id;
        this.displayName = displayName;
        this.createdAt = now;
        this.lastSignInAt = now;
    }

    void signedIn(Instant now) {
        this.previousSignInAt = lastSignInAt;
        this.lastSignInAt = now;
    }

    public UUID id() {
        return id;
    }

    public String displayName() {
        return displayName;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Instant lastSignInAt() {
        return lastSignInAt;
    }

    public Instant previousSignInAt() {
        return previousSignInAt;
    }
}
