package fr.beelot.game;

/** A match target other than 500, 1,000, 1,500 or 2,000 points (US-062). */
public final class InvalidMatchTargetException extends IllegalArgumentException {

    public InvalidMatchTargetException() {
        super("The match target must be 500, 1,000, 1,500 or 2,000 points.");
    }
}
