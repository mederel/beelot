package fr.beelot.application.account;

import jakarta.servlet.http.HttpServletRequest;

import java.util.Locale;
import java.util.Set;

/** The text of the email carrying a sign-in link, in English, French or Dutch. */
public record SignInEmail(String subject, String body) {

    private static final Set<String> LANGUAGES = Set.of("en", "fr", "nl");

    /** The email in the given language (French, Dutch, else English); the link sits on a line of its own. */
    public static SignInEmail of(Locale locale, String link) {
        String language = locale == null ? "" : locale.getLanguage();
        return switch (language) {
            case "fr" -> new SignInEmail("Votre lien de connexion à Beelot", """
                    Bonjour,

                    Utilisez ce lien pour vous connecter à Beelot. Si vous n’avez pas encore de compte, il en crée un.

                    %s

                    Le lien fonctionne une seule fois, pendant 15 minutes. Si vous ne l’avez pas demandé, ignorez cet e-mail : personne ne peut se connecter sans lui.
                    """.formatted(link));
            case "nl" -> new SignInEmail("Je aanmeldlink voor Beelot", """
                    Hallo,

                    Gebruik deze link om je aan te melden bij Beelot. Als je nog geen account hebt, wordt er een aangemaakt.

                    %s

                    De link werkt één keer, 15 minuten lang. Heb je hem niet aangevraagd? Negeer deze e-mail dan: zonder de link kan niemand zich aanmelden.
                    """.formatted(link));
            default -> new SignInEmail("Your Beelot sign-in link", """
                    Hello,

                    Use this link to sign in to Beelot. If you have no account yet, it creates one.

                    %s

                    The link works once, for 15 minutes. If you did not ask for it, ignore this email: nobody can sign in without it.
                    """.formatted(link));
        };
    }

    /** The {@code language} parameter (en, fr, nl) when present, else the best match of {@code Accept-Language}. */
    public static Locale language(HttpServletRequest request) {
        String requested = request.getParameter("language");
        if (requested != null && LANGUAGES.contains(requested)) {
            return Locale.forLanguageTag(requested);
        }
        if (requested != null && !requested.isBlank()) {
            return Locale.ENGLISH;
        }
        return PseudonymGenerator.language(request.getHeader("Accept-Language"));
    }
}
