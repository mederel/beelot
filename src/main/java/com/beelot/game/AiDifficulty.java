package com.beelot.game;

public enum AiDifficulty {
    RELAXED("Relaxed"),
    CHALLENGING("Challenging");

    private final String displayName;

    AiDifficulty(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }
}
