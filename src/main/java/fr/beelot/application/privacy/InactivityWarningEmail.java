package fr.beelot.application.privacy;

/**
 * The email warning an email-link player that their inactive account will be deleted in 30 days (US-083). No language
 * is stored per account, so it is written in French, English and Dutch at once.
 */
record InactivityWarningEmail(String subject, String body) {

    static InactivityWarningEmail of(String publicUrl) {
        return new InactivityWarningEmail(
                "Beelot: your account will be deleted in 30 days / votre compte sera supprimé dans 30 jours / "
                        + "je account wordt over 30 dagen verwijderd",
                """
                Bonjour,

                Vous ne vous êtes pas connecté à Beelot depuis bientôt 3 ans. Votre compte, votre adresse e-mail et votre historique de connexion seront supprimés dans 30 jours, sauf si vous vous connectez d’ici là :

                %1$s

                ---

                Hello,

                You have not signed in to Beelot for almost 3 years. Your account, your email address and your sign-in history will be deleted in 30 days, unless you sign in before then:

                %1$s

                ---

                Hallo,

                Je hebt je al bijna 3 jaar niet aangemeld bij Beelot. Je account, je e-mailadres en je aanmeldgeschiedenis worden over 30 dagen verwijderd, tenzij je je voor die tijd aanmeldt:

                %1$s
                """.formatted(publicUrl));
    }
}
