package fr.beelot.application.history;

/** Receives each match as soon as a team wins it. */
public interface MatchRecorder {

    MatchRecorder NONE = match -> { };

    void record(FinishedMatch match);
}
