package fr.beelot.game;

public enum BotDifficulty {
    RELAXED("Relaxed"),
    CHALLENGING("Challenging");

    private final String displayName;

    BotDifficulty(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }
}
