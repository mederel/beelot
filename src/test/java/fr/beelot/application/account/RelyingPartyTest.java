package fr.beelot.application.account;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RelyingPartyTest {

    @Test
    void relyingPartyFromPublicUrl() {
        assertEquals(new RelyingParty("localhost", "http://localhost:8080"), RelyingParty.of("http://localhost:8080"));
        assertEquals(new RelyingParty("beelot.fr", "https://beelot.fr"), RelyingParty.of("https://beelot.fr/"));
        assertEquals(new RelyingParty("beelot.fr", "https://beelot.fr"), RelyingParty.of("https://beelot.fr:443"));
        assertThrows(IllegalArgumentException.class, () -> RelyingParty.of("beelot.fr"));
    }
}
