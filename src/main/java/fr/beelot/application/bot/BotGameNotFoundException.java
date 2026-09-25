package fr.beelot.application.bot;

import java.util.UUID;

class BotGameNotFoundException extends RuntimeException {

    BotGameNotFoundException(UUID id) {
        super("Bot game not found: " + id);
    }
}
