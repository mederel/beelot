package fr.beelot.application.account;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AccountServiceTest {

    @Test
    void namesTheAccountAfterTheProfileName() {
        assertEquals("Ana Martin", AccountService.displayName(Map.of("name", " Ana Martin ", "login", "ana")));
    }

    @Test
    void fallsBackOnTheLoginWhenTheProfileHasNoName() {
        assertEquals("ana", AccountService.displayName(Map.of("login", "ana", "name", "  ")));
    }

    @Test
    void shortensLongNamesToThirtyCharacters() {
        assertEquals("A".repeat(30), AccountService.displayName(Map.of("name", "A".repeat(40))));
    }

    @Test
    void namesAnAnonymousProfilePlayer() {
        assertEquals("Player", AccountService.displayName(Map.of("id", 42)));
    }
}
