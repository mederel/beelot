package fr.beelot.application.account;

import java.util.Locale;

/**
 * The emails of a change of address (US-079), in English, French or Dutch: the link sent to the new address, the
 * notice sent instead when that address already has an account, and the notice sent to the old address once the
 * change is made.
 */
public record EmailChangeEmail(String subject, String body) {

    /** The link that makes the new address the account's own; it sits on a line of its own. */
    public static EmailChangeEmail link(Locale locale, String link) {
        return switch (language(locale)) {
            case "fr" -> new EmailChangeEmail("Confirmez votre nouvelle adresse Beelot", """
                    Bonjour,

                    Utilisez ce lien pour vous connecter désormais à Beelot avec cette adresse.

                    %s

                    Le lien fonctionne une seule fois, pendant 15 minutes. Tant que vous ne l’avez pas ouvert, votre adresse actuelle continue de fonctionner. Si vous ne l’avez pas demandé, ignorez cet e-mail.
                    """.formatted(link));
            case "nl" -> new EmailChangeEmail("Bevestig je nieuwe Beelot-adres", """
                    Hallo,

                    Gebruik deze link om je voortaan met dit adres aan te melden bij Beelot.

                    %s

                    De link werkt één keer, 15 minuten lang. Tot je hem opent, blijft je huidige adres werken. Heb je dit niet aangevraagd? Negeer deze e-mail dan.
                    """.formatted(link));
            default -> new EmailChangeEmail("Confirm your new Beelot address", """
                    Hello,

                    Use this link to make this address the one you sign in to Beelot with.

                    %s

                    The link works once, for 15 minutes. Until you open it, your current address keeps working. If you did not ask for this, ignore this email.
                    """.formatted(link));
        };
    }

    /** Sent instead of a link when the new address already has an account; it says nothing about the other one. */
    public static EmailChangeEmail taken(Locale locale) {
        return switch (language(locale)) {
            case "fr" -> new EmailChangeEmail("Cette adresse a déjà un compte Beelot", """
                    Bonjour,

                    Quelqu’un a demandé à déplacer un compte Beelot vers cette adresse, mais elle a déjà son propre compte. Rien n’a été modifié. Vous pouvez continuer à vous connecter avec cette adresse comme d’habitude.

                    Si vous ne l’avez pas demandé, ignorez cet e-mail.
                    """);
            case "nl" -> new EmailChangeEmail("Dit adres heeft al een Beelot-account", """
                    Hallo,

                    Iemand heeft gevraagd een Beelot-account naar dit adres te verplaatsen, maar dit adres heeft al een eigen account. Er is niets gewijzigd. Je kunt je zoals gewoonlijk met dit adres blijven aanmelden.

                    Heb je dit niet aangevraagd? Negeer deze e-mail dan.
                    """);
            default -> new EmailChangeEmail("This address already has a Beelot account", """
                    Hello,

                    Someone asked to move a Beelot account to this address, but it already has an account of its own. Nothing was changed. You can keep signing in with this address as usual.

                    If you did not ask for this, ignore this email.
                    """);
        };
    }

    /** Sent to the old address once the change is made; names the contact only when one is configured. */
    public static EmailChangeEmail changed(Locale locale, String newEmail, String contactOrBlank) {
        String masked = mask(newEmail);
        boolean contact = contactOrBlank != null && !contactOrBlank.isBlank();
        return switch (language(locale)) {
            case "fr" -> new EmailChangeEmail("Votre adresse Beelot a été modifiée", """
                    Bonjour,

                    Votre compte Beelot se connecte désormais avec %s. Cette adresse ne permet plus d’accéder à ce compte : vous connecter avec elle créerait un nouveau compte, vide. Toutes les sessions du compte ont été fermées.
                    """.formatted(masked) + (contact
                    ? "\nSi vous n’êtes pas à l’origine de ce changement, écrivez à %s.\n".formatted(contactOrBlank)
                    : ""));
            case "nl" -> new EmailChangeEmail("Je Beelot-adres is gewijzigd", """
                    Hallo,

                    Je Beelot-account meldt zich nu aan met %s. Dit adres geeft geen toegang meer tot dit account: als je je ermee aanmeldt, maak je een nieuw, leeg account aan. Alle sessies van het account zijn afgemeld.
                    """.formatted(masked) + (contact
                    ? "\nHeb je deze wijziging niet zelf gedaan? Schrijf dan naar %s.\n".formatted(contactOrBlank)
                    : ""));
            default -> new EmailChangeEmail("Your Beelot address was changed", """
                    Hello,

                    Your Beelot account now signs in with %s. This address no longer signs in to this account: signing in with it would start a new, empty account. Every session of the account has been signed out.
                    """.formatted(masked) + (contact
                    ? "\nIf you did not make this change, write to %s.\n".formatted(contactOrBlank)
                    : ""));
        };
    }

    /** The first letter of the local part, then {@code ***} and the domain: {@code p***@example.com}. */
    public static String mask(String email) {
        int at = email.lastIndexOf('@');
        return email.charAt(0) + "***" + email.substring(at);
    }

    private static String language(Locale locale) {
        return locale == null ? "" : locale.getLanguage();
    }
}
