package com.beelot.application.ai;

import com.beelot.game.AiDifficulty;
import com.beelot.game.AiGame;
import com.beelot.game.GameSeat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/ai-games")
class AiGameController {

    private final AiGameService aiGameService;

    AiGameController(AiGameService aiGameService) {
        this.aiGameService = aiGameService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    AiGameResponse create(@RequestBody CreateAiGameRequest request) {
        return AiGameResponse.from(aiGameService.create(request.difficulty()));
    }

    @GetMapping("/{gameId}")
    AiGameResponse get(@PathVariable UUID gameId) {
        return AiGameResponse.from(aiGameService.get(gameId));
    }

    @ExceptionHandler(AiGameNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    void gameNotFound() {
    }

    record CreateAiGameRequest(AiDifficulty difficulty) {
    }

    record AiGameResponse(UUID id, AiDifficulty difficulty, String difficultyLabel, List<SeatResponse> seats) {
        static AiGameResponse from(AiGame game) {
            List<SeatResponse> seats = game.seats().stream()
                    .map(seat -> new SeatResponse(seat.name(), seat.type().name()))
                    .toList();
            return new AiGameResponse(game.id(), game.difficulty(), game.difficulty().displayName(), seats);
        }
    }

    record SeatResponse(String name, String type) {
    }
}
