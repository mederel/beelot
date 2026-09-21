package fr.beelot.application.ai;

import java.util.UUID;

class AiGameNotFoundException extends RuntimeException {

    AiGameNotFoundException(UUID id) {
        super("AI game not found: " + id);
    }
}
