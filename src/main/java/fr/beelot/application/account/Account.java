package fr.beelot.application.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** A player who signed in with an OAuth provider, identified by the provider and the provider's user id. */
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

    void signedIn(String displayName, Instant now) {
        this.displayName = displayName;
        this.lastSignInAt = now;
    }

    public UUID id() {
        return id;
    }

    public String provider() {
        return provider;
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
}
