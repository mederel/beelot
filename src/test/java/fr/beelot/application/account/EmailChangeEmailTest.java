package fr.beelot.application.account;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

class EmailChangeEmailTest {

    private static final String LINK = "https://beelot.test/settings/email?token=abc";
    private static final List<Locale> LANGUAGES =
            List.of(Locale.ENGLISH, Locale.FRENCH, Locale.forLanguageTag("nl"));

    @Test
    void theLinkSitsOnItsOwnLineInEachLanguage() {
        for (Locale language : LANGUAGES) {
            assertThat(EmailChangeEmail.link(language, LINK).body().lines()).contains(LINK);
        }
        assertThat(EmailChangeEmail.link(Locale.ENGLISH, LINK).subject()).isEqualTo("Confirm your new Beelot address");
        assertThat(EmailChangeEmail.link(Locale.FRENCH, LINK).subject())
                .isEqualTo("Confirmez votre nouvelle adresse Beelot");
        assertThat(EmailChangeEmail.link(Locale.forLanguageTag("nl"), LINK).subject())
                .isEqualTo("Bevestig je nieuwe Beelot-adres");
    }

    @Test
    void anUnknownLanguageFallsBackToEnglish() {
        assertThat(EmailChangeEmail.link(Locale.GERMAN, LINK).subject()).isEqualTo("Confirm your new Beelot address");
        assertThat(EmailChangeEmail.link(null, LINK).subject()).isEqualTo("Confirm your new Beelot address");
    }

    @Test
    void theTakenNoticeHasNoLink() {
        for (Locale language : LANGUAGES) {
            assertThat(EmailChangeEmail.taken(language).body()).doesNotContain("http");
        }
        assertThat(EmailChangeEmail.taken(Locale.ENGLISH).subject())
                .isEqualTo("This address already has a Beelot account");
    }

    @Test
    void theChangeNoticeShowsTheMaskedAddressAndTheContact() {
        for (Locale language : LANGUAGES) {
            EmailChangeEmail email = EmailChangeEmail.changed(language, "new.player@example.com",
                    "privacy@beelot.test");
            assertThat(email.body()).contains("n***@example.com").contains("privacy@beelot.test")
                    .doesNotContain("new.player");
        }
        assertThat(EmailChangeEmail.changed(Locale.ENGLISH, "a@b.fr", "x").subject())
                .isEqualTo("Your Beelot address was changed");
    }

    @Test
    void theChangeNoticeOmitsABlankContact() {
        assertThat(EmailChangeEmail.changed(Locale.ENGLISH, "a@b.fr", "").body()).doesNotContain("write to");
        assertThat(EmailChangeEmail.changed(Locale.ENGLISH, "a@b.fr", null).body()).doesNotContain("write to");
    }

    @Test
    void maskKeepsTheFirstLetterAndTheDomain() {
        assertThat(EmailChangeEmail.mask("a@b.fr")).isEqualTo("a***@b.fr");
        assertThat(EmailChangeEmail.mask("player@example.com")).isEqualTo("p***@example.com");
    }
}
