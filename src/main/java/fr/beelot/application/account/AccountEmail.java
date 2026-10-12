package fr.beelot.application.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/** The address of an email-link account, kept apart from the account and used only to send sign-in links. */
@Entity
@Table(name = "account_email")
public class AccountEmail {

    @Id
    @Column(name = "account_id")
    private UUID accountId;

    @Column(nullable = false)
    private String email;

    protected AccountEmail() {
    }

    AccountEmail(UUID accountId, String email) {
        this.accountId = accountId;
        this.email = email;
    }

    UUID accountId() {
        return accountId;
    }

    String email() {
        return email;
    }
}
