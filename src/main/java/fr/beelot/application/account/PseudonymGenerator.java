package fr.beelot.application.account;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.random.RandomGenerator;

/**
 * Names a new account with a random pseudonym, such as "Swift Otter 42", so that no personal data from the identity
 * provider is ever shown or stored (US-075). Pseudonyms are in English, French or Dutch, at most 30 characters, and
 * not unique: players are identified by their account, not by their name.
 */
@Component
public class PseudonymGenerator {

    private static final Words ENGLISH = new Words(false,
            List.of("Swift", "Brave", "Clever", "Calm", "Bold", "Lucky", "Witty", "Jolly", "Nimble", "Quiet", "Sunny",
                    "Daring", "Gentle", "Mighty", "Plucky", "Wise"),
            List.of("Otter", "Fox", "Badger", "Heron", "Owl", "Lynx", "Panda", "Falcon", "Beaver", "Hedgehog",
                    "Dolphin", "Raven", "Tiger", "Koala", "Rabbit", "Squirrel"));

    /** French adjectives follow the noun; they have the same masculine and feminine form, so they fit every animal. */
    private static final Words FRENCH = new Words(true,
            List.of("Agile", "Rapide", "Calme", "Habile", "Brave", "Sage", "Tenace", "Fidèle", "Aimable", "Espiègle",
                    "Intrépide", "Héroïque", "Magnifique", "Superbe", "Paisible", "Sympathique"),
            List.of("Loutre", "Renard", "Blaireau", "Héron", "Hibou", "Lynx", "Panda", "Faucon", "Castor", "Hérisson",
                    "Dauphin", "Corbeau", "Tigre", "Koala", "Lapin", "Écureuil"));

    /** Every Dutch animal is a "de" word, so the adjectives take their inflected form. */
    private static final Words DUTCH = new Words(false,
            List.of("Snelle", "Dappere", "Slimme", "Kalme", "Stoere", "Vrolijke", "Wijze", "Lenige", "Stille",
                    "Zonnige", "Moedige", "Zachte", "Machtige", "Gelukkige", "Sterke", "Kwieke"),
            List.of("Otter", "Vos", "Das", "Reiger", "Uil", "Lynx", "Panda", "Valk", "Bever", "Egel", "Dolfijn",
                    "Raaf", "Tijger", "Koala", "Haas", "Eekhoorn"));

    private final RandomGenerator random;

    @Autowired
    PseudonymGenerator() {
        this(RandomGenerator.getDefault());
    }

    PseudonymGenerator(RandomGenerator random) {
        this.random = random;
    }

    /** A new pseudonym in the given language (French, Dutch, else English), ending with a number from 10 to 99. */
    public String generate(Locale locale) {
        Words words = words(locale);
        String adjective = words.adjectives.get(random.nextInt(words.adjectives.size()));
        String animal = words.animals.get(random.nextInt(words.animals.size()));
        return words.name(adjective, animal) + " " + (10 + random.nextInt(90));
    }

    /** Every pseudonym of a language, without its number. */
    static List<String> all(Locale language) {
        Words words = words(language);
        List<String> names = new ArrayList<>();
        for (String adjective : words.adjectives) {
            for (String animal : words.animals) {
                names.add(words.name(adjective, animal));
            }
        }
        return names;
    }

    private static Words words(Locale locale) {
        String language = locale == null ? "" : locale.getLanguage();
        return switch (language) {
            case "fr" -> FRENCH;
            case "nl" -> DUTCH;
            default -> ENGLISH;
        };
    }

    private record Words(boolean adjectiveAfterNoun, List<String> adjectives, List<String> animals) {

        String name(String adjective, String animal) {
            return adjectiveAfterNoun ? animal + " " + adjective : adjective + " " + animal;
        }
    }
}
