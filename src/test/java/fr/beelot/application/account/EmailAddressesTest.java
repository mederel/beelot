package fr.beelot.application.account;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;

class EmailAddressesTest {

    @Test
    void anAddressIsTrimmedAndLowerCased() {
        assertEquals(Optional.of("jane@example.com"), EmailAddresses.normalise(" Jane@Example.COM "));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "jane", "a@b@c.fr", "@example.com", "jane@example", "jane@.example.com",
            "jane@example.com."})
    void somethingThatIsNotAnAddressIsRefused(String raw) {
        assertEquals(Optional.empty(), EmailAddresses.normalise(raw));
    }

    @Test
    void anAddressOf255CharactersIsRefused() {
        String address = "a".repeat(255 - "@example.com".length()) + "@example.com";
        assertEquals(255, address.length());
        assertEquals(Optional.empty(), EmailAddresses.normalise(address));
    }

    @Test
    void anAddressOf254CharactersIsAccepted() {
        String address = "a".repeat(254 - "@example.com".length()) + "@example.com";
        assertEquals(Optional.of(address), EmailAddresses.normalise(address));
    }
}
