package fr.beelot.application.account;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Locale;
import java.util.SplittableRandom;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PseudonymGeneratorTest {

    @Test
    void namesInTheRequestedLanguage() {
        String french = new PseudonymGenerator(new SplittableRandom(7)).generate(Locale.FRENCH);
        assertTrue(french.matches("\\p{Lu}\\S* \\p{Lu}\\S* \\d\\d"), french);
        assertTrue(PseudonymGenerator.all(Locale.FRENCH).contains(withoutNumber(french)), french);

        String dutch = new PseudonymGenerator(new SplittableRandom(7)).generate(Locale.of("nl", "BE"));
        assertTrue(PseudonymGenerator.all(Locale.of("nl")).contains(withoutNumber(dutch)), dutch);
    }

    @Test
    void fallsBackOnEnglish() {
        String german = new PseudonymGenerator(new SplittableRandom(7)).generate(Locale.GERMAN);
        assertTrue(PseudonymGenerator.all(Locale.ENGLISH).contains(withoutNumber(german)), german);

        String unknown = new PseudonymGenerator(new SplittableRandom(7)).generate(null);
        assertTrue(PseudonymGenerator.all(Locale.ENGLISH).contains(withoutNumber(unknown)), unknown);
    }

    @Test
    void everyPseudonymFitsThirtyCharacters() {
        for (Locale language : List.of(Locale.ENGLISH, Locale.FRENCH, Locale.of("nl"))) {
            for (String name : PseudonymGenerator.all(language)) {
                assertTrue((name + " 99").length() <= 30, name);
            }
        }
    }

    @Test
    void numbersRunFromTenToNinetyNine() {
        PseudonymGenerator generator = new PseudonymGenerator(new SplittableRandom(1));
        for (int i = 0; i < 1000; i++) {
            int number = Integer.parseInt(generator.generate(Locale.ENGLISH).replaceAll(".* ", ""));
            assertTrue(number >= 10 && number <= 99, String.valueOf(number));
        }
    }

    @Test
    void picksTheBestSupportedLanguageOfTheAcceptLanguageHeader() {
        assertEquals(Locale.of("nl"), PseudonymGenerator.language("de-DE, nl;q=0.9"));
        assertEquals(Locale.FRENCH, PseudonymGenerator.language("fr-BE,fr;q=0.9,en;q=0.8"));
        assertEquals(Locale.ENGLISH, PseudonymGenerator.language("de-DE"));
    }

    /** Not the server's default locale, which a servlet request falls back on without the header. */
    @Test
    void usesEnglishWithoutAUsableHeader() {
        assertEquals(Locale.ENGLISH, PseudonymGenerator.language(null));
        assertEquals(Locale.ENGLISH, PseudonymGenerator.language(""));
        assertEquals(Locale.ENGLISH, PseudonymGenerator.language(";;q=nonsense"));
    }

    static String withoutNumber(String pseudonym) {
        return pseudonym.substring(0, pseudonym.lastIndexOf(' '));
    }
}
