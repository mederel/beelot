package fr.beelot.application.matchmaking;

import fr.beelot.application.privategame.PrivateTableService;
import fr.beelot.application.privategame.PrivateTableService.PrivateTableAccess;
import fr.beelot.game.GameVariant;
import fr.beelot.game.PrivateTable;
import fr.beelot.game.PrivateTableConflictException;
import fr.beelot.game.PrivateTableStatus;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MatchmakingServiceTest {

    private final PrivateTableService tables = new PrivateTableService(Duration.ofMinutes(2), 2000, Duration.ofHours(2), Duration.ofSeconds(60));
    private final MatchmakingService matchmaking = new MatchmakingService(tables);

    @Test
    void firstPlayerOpensATable() {
        PrivateTable table = matchmaking.quickMatch("Ana", GameVariant.CLASSIC).table();

        assertTrue(table.publicTable());
        assertEquals(1, table.seats().size());
    }

    @Test
    void playersOfTheSameVariantShareATable() {
        PrivateTable first = matchmaking.quickMatch("Ana", GameVariant.CLASSIC).table();
        PrivateTable second = matchmaking.quickMatch("Benoit", GameVariant.CLASSIC).table();

        assertEquals(first.id(), second.id());
        assertEquals(2, second.seats().size());
    }

    @Test
    void variantsAreNotMixed() {
        UUID classic = matchmaking.quickMatch("Ana", GameVariant.CLASSIC).table().id();
        UUID contree = matchmaking.quickMatch("Benoit", GameVariant.CONTREE).table().id();

        assertNotEquals(classic, contree);
    }

    @Test
    void prefersTheFullestTable() {
        UUID fuller = tables.openPublic("Ana", GameVariant.CLASSIC).table().id();
        tables.joinPublic(fuller, "Benoit");
        tables.joinPublic(fuller, "Chloe");
        tables.openPublic("David", GameVariant.CLASSIC);

        PrivateTable table = matchmaking.quickMatch("Emma", GameVariant.CLASSIC).table();

        assertEquals(fuller, table.id());
        assertEquals(PrivateTableStatus.IN_PROGRESS, table.status());
    }

    @Test
    void fourQuickMatchesStartOneGameAndTheFifthOpensANewTable() {
        PrivateTable table = null;
        for (String name : List.of("Ana", "Benoit", "Chloe", "David")) {
            PrivateTable seated = matchmaking.quickMatch(name, GameVariant.CLASSIC).table();
            if (table != null) assertEquals(table.id(), seated.id());
            table = seated;
        }
        assertEquals(PrivateTableStatus.IN_PROGRESS, table.status());

        PrivateTable fifth = matchmaking.quickMatch("Emma", GameVariant.CLASSIC).table();

        assertNotEquals(table.id(), fifth.id());
        assertEquals(1, fifth.seats().size());
    }

    @Test
    void afterTheLastPlayerLeavesANewTableIsOpened() {
        PrivateTableAccess first = matchmaking.quickMatch("Ana", GameVariant.CLASSIC);
        tables.leave(first.table().id(), first.token());

        PrivateTable next = matchmaking.quickMatch("Benoit", GameVariant.CLASSIC).table();

        assertNotEquals(first.table().id(), next.id());
    }

    @Test
    void parallelQuickMatchesFillTablesCompletely() throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(8);
        CountDownLatch gate = new CountDownLatch(1);
        List<Future<PrivateTable>> results = new ArrayList<>();
        for (int index = 0; index < 8; index++) {
            String name = "Player " + index;
            results.add(executor.submit(() -> {
                gate.await();
                return matchmaking.quickMatch(name, GameVariant.CLASSIC).table();
            }));
        }
        gate.countDown();
        List<PrivateTable> seated = new ArrayList<>();
        for (Future<PrivateTable> result : results) seated.add(result.get());
        executor.shutdown();

        Map<UUID, PrivateTable> distinct = seated.stream()
                .collect(Collectors.toMap(PrivateTable::id, table -> table, (first, second) -> first));
        assertEquals(2, distinct.size());
        for (PrivateTable table : distinct.values()) {
            assertEquals(PrivateTableStatus.IN_PROGRESS, table.status());
            assertEquals(4, table.seats().size());
        }
    }

    @Test
    void rejectsABlankName() {
        assertThrows(PrivateTableConflictException.class, () -> matchmaking.quickMatch(" ", GameVariant.CLASSIC));
    }
}
