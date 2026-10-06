package fr.beelot.application.history;

/** The two partnerships, as stored: North and South hold the even seats. */
enum Team {
    NORTH_SOUTH, EAST_WEST;

    /** The team of a game's team name ("North–South" or "East–West"), or null for none. */
    static Team of(String name) {
        if (name == null || name.isEmpty()) return null;
        return name.startsWith("North") ? NORTH_SOUTH : EAST_WEST;
    }
}
