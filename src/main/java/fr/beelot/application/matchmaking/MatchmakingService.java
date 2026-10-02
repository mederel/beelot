package fr.beelot.application.matchmaking;

import fr.beelot.application.privategame.PrivateTableService;
import fr.beelot.application.privategame.PrivateTableService.PrivateTableAccess;
import fr.beelot.game.GameVariant;
import fr.beelot.game.PrivateTable;
import fr.beelot.game.PrivateTableConflictException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;

/** Seats players at public tables of their variant; a table starts when full, or with bots once its wait is over. */
@Service
public class MatchmakingService {

    private static final Comparator<PrivateTable> FULLEST_FIRST = Comparator
            .comparingInt((PrivateTable table) -> table.seats().size()).reversed()
            .thenComparing(PrivateTable::botFillAt);

    private final PrivateTableService tables;

    public MatchmakingService(PrivateTableService tables) {
        this.tables = tables;
    }

    public synchronized PrivateTableAccess quickMatch(String playerName, GameVariant variant) {
        if (variant == null) variant = GameVariant.CLASSIC;
        for (PrivateTable table : tables.openPublicTables(variant).stream().sorted(FULLEST_FIRST).toList()) {
            try {
                return tables.joinPublic(table.id(), playerName);
            } catch (PrivateTableConflictException filledOrGone) {
                // Bots may have filled the table meanwhile; an invalid name fails again when opening a table below.
            }
        }
        return tables.openPublic(playerName, variant);
    }

    @Scheduled(fixedDelayString = "${beelot.matchmaking.sweep-interval:PT5S}")
    public void sweep() {
        tables.fillPublicTablesWithBots(Instant.now());
    }
}
