package fr.beelot.application.account;

import java.util.Locale;
import java.util.Optional;

/** The one way an email address is written down, so that the same address always reaches the same account. */
public final class EmailAddresses {

    private static final int MAX_LENGTH = 254;

    private EmailAddresses() {
    }

    /**
     * The address trimmed and lower-cased, or empty when it is not an address: at most 254 characters, exactly one
     * {@code @}, a local part, and a domain with a dot that neither starts nor ends it.
     */
    public static Optional<String> normalise(String raw) {
        if (raw == null) return Optional.empty();
        String email = raw.trim().toLowerCase(Locale.ROOT);
        if (email.length() > MAX_LENGTH) return Optional.empty();
        int at = email.indexOf('@');
        if (at <= 0 || at != email.lastIndexOf('@')) return Optional.empty();
        String domain = email.substring(at + 1);
        if (domain.indexOf('.') < 0 || domain.startsWith(".") || domain.endsWith(".")) return Optional.empty();
        return Optional.of(email);
    }
}
