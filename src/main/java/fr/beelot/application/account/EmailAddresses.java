package fr.beelot.application.account;

import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;

import java.util.Locale;
import java.util.Optional;

/** The one way an email address is written down, so that the same address always reaches the same account. */
public final class EmailAddresses {

    private static final int MAX_LENGTH = 254;
    private static final String FORBIDDEN = "<>()[]\\\",;:";

    private EmailAddresses() {
    }

    /**
     * The address trimmed and lower-cased, or empty when it is not an address: at most 254 characters, exactly one
     * {@code @}, a local part, and a domain with a dot that neither starts nor ends it. Only a plain address is
     * accepted: no whitespace (non-breaking spaces included), control character or {@code <>()[]\",;:}, and one
     * that Jakarta Mail reads back as itself, so that a mailbox cannot be written in several ways.
     */
    public static Optional<String> normalise(String raw) {
        if (raw == null) return Optional.empty();
        String email = raw.trim().toLowerCase(Locale.ROOT);
        if (email.length() > MAX_LENGTH) return Optional.empty();
        int at = email.indexOf('@');
        if (at <= 0 || at != email.lastIndexOf('@')) return Optional.empty();
        String domain = email.substring(at + 1);
        if (domain.indexOf('.') < 0 || domain.startsWith(".") || domain.endsWith(".")) return Optional.empty();
        for (int i = 0; i < email.length(); i++) {
            char c = email.charAt(i);
            if (Character.isWhitespace(c) || Character.isSpaceChar(c) || Character.isISOControl(c)
                    || FORBIDDEN.indexOf(c) >= 0) {
                return Optional.empty();
            }
        }
        try {
            if (!email.equals(new InternetAddress(email, true).getAddress())) return Optional.empty();
        } catch (AddressException e) {
            return Optional.empty();
        }
        return Optional.of(email);
    }
}
