package fr.beelot.application.account;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

class SignInEmailTest {

    private static final String LINK = "https://beelot.fr/sign-in?token=TOKEN";

    @Test
    void eachLanguageHasItsSubject() {
        assertThat(SignInEmail.of(Locale.ENGLISH, LINK).subject()).isEqualTo("Your Beelot sign-in link");
        assertThat(SignInEmail.of(Locale.FRENCH, LINK).subject()).isEqualTo("Votre lien de connexion à Beelot");
        assertThat(SignInEmail.of(Locale.forLanguageTag("nl"), LINK).subject()).isEqualTo("Je aanmeldlink voor Beelot");
        assertThat(SignInEmail.of(Locale.GERMAN, LINK).subject()).isEqualTo("Your Beelot sign-in link");
    }

    @Test
    void theBodyHoldsTheLinkOnALineOfItsOwn() {
        for (Locale locale : new Locale[]{Locale.ENGLISH, Locale.FRENCH, Locale.forLanguageTag("nl")}) {
            assertThat(SignInEmail.of(locale, LINK).body().lines()).contains(LINK);
        }
    }

    @Test
    void theLanguageComesFromTheParameterThenFromAcceptLanguage() {
        MockHttpServletRequest withParameter = new MockHttpServletRequest();
        withParameter.setParameter("language", "fr");
        withParameter.addHeader("Accept-Language", "nl");
        assertThat(SignInEmail.language(withParameter)).isEqualTo(Locale.FRENCH);

        MockHttpServletRequest withHeader = new MockHttpServletRequest();
        withHeader.addHeader("Accept-Language", "nl-BE");
        assertThat(SignInEmail.language(withHeader).getLanguage()).isEqualTo("nl");

        MockHttpServletRequest unsupported = new MockHttpServletRequest();
        unsupported.setParameter("language", "de");
        assertThat(SignInEmail.language(unsupported)).isEqualTo(Locale.ENGLISH);
    }
}
