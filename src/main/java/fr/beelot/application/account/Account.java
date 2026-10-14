package fr.beelot.application.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** A player who signed in, identified by the provider and the provider's user id, and named with a pseudonym. */
@Entity
@Table(name = "account")
public class Account {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String provider;

    @Column(name = "provider_subject", nullable = false)
    private String providerSubject;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_sign_in_at", nullable = false)
    private Instant lastSignInAt;

    /** The sign-in before the latest one, shown to the player to spot an access they did not make (US-077). */
    @Column(name = "previous_sign_in_at")
    private Instant previousSignInAt;

    /** When the player was warned that the inactive account would be deleted; a sign-in clears it (US-083). */
    @Column(name = "deletion_warned_at")
    private Instant deletionWarnedAt;

    protected Account() {
    }

    Account(String provider, String providerSubject, String displayName, Instant now) {
        this.id = UUID.randomUUID();
        this.provider = provider;
        this.providerSubject = providerSubject;
        this.displayName = displayName;
        this.createdAt = now;
        this.lastSignInAt = now;
    }

    /** An account for a player who signs in with an email link; it is its own provider subject. */
    static Account withEmail(String displayName, Instant now) {
        Account account = new Account("email", null, displayName, now);
        account.providerSubject = account.id.toString();
        return account;
    }

    void signedIn(Instant now) {
        this.previousSignInAt = lastSignInAt;
        this.lastSignInAt = now;
        this.deletionWarnedAt = null;
    }

    public UUID id() {
        return id;
    }

    public String provider() {
        return provider;
    }

    String providerSubject() {
        return providerSubject;
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

    public Instant deletionWarnedAt() {
        return deletionWarnedAt;
    }
}
