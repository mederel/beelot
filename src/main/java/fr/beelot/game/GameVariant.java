package fr.beelot.game;

public enum GameVariant {
    CLASSIC("Classic Belote"),
    CONTREE("Contrée");

    private final String displayName;

    GameVariant(String displayName) { this.displayName = displayName; }
    public String displayName() { return displayName; }
}
