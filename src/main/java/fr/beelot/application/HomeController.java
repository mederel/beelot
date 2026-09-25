package fr.beelot.application;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
class HomeController {

    @GetMapping({"/play/bot", "/play/bot/bidding/{gameId}", "/play/bot/game/{gameId}", "/online/private", "/online/private/table/{tableId}", "/tutorial", "/rules", "/settings"})
    String selectedMode() {
        return "forward:/index.html";
    }
}
