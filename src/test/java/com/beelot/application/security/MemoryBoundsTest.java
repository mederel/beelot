package com.beelot.application.security;

import com.beelot.application.ai.AiGameService;
import com.beelot.application.privategame.PrivateTableService;
import com.beelot.game.AiDifficulty;
import com.beelot.game.PrivateTableConflictException;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MemoryBoundsTest {

    @Test
    void aiGamesAreCappedAndIdleGamesAreEvicted() {
        AiGameService service = new AiGameService(2, Duration.ofHours(1));
        service.create(AiDifficulty.CHALLENGING);
        service.create(AiDifficulty.CHALLENGING);
        assertThatThrownBy(() -> service.create(AiDifficulty.CHALLENGING))
                .isInstanceOf(CapacityExceededException.class);
        service.evictIdle();
        assertThat(service.gameCount()).isEqualTo(2);
    }

    @Test
    void idleAiGamesFreeCapacity() {
        AiGameService service = new AiGameService(1, Duration.ZERO);
        var first = service.create(AiDifficulty.CHALLENGING);
        service.create(AiDifficulty.CHALLENGING);
        assertThat(service.gameCount()).isEqualTo(1);
        assertThatThrownBy(() -> service.get(first.id())).isNotNull();
    }

    @Test
    void privateTablesAreCappedAndIdleTablesEvictedWithTheirCodes() {
        PrivateTableService service = new PrivateTableService(Duration.ofMinutes(2), 1, Duration.ZERO);
        var first = service.create("Ann");
        String code = first.table().invitationCode();
        service.create("Bob");
        assertThatThrownBy(() -> service.join(code, "Cy")).isInstanceOf(PrivateTableConflictException.class);
        assertThat(service.tableCount()).isEqualTo(1);

        PrivateTableService capped = new PrivateTableService(Duration.ofMinutes(2), 1, Duration.ofHours(1));
        capped.create("Ann");
        assertThatThrownBy(() -> capped.create("Bob")).isInstanceOf(CapacityExceededException.class);
    }

    @Test
    void rejectsOverlongPlayerNames() {
        PrivateTableService service = new PrivateTableService();
        assertThatThrownBy(() -> service.create("x".repeat(200))).isInstanceOf(PrivateTableConflictException.class);
    }
}
