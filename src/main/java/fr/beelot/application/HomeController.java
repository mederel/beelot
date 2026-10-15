package fr.beelot.application;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
class HomeController {

    @GetMapping({"/play/bot", "/play/local", "/play/bot/bidding/{gameId}", "/play/bot/game/{gameId}",
            "/online/private", "/online/private/table/{tableId}", "/online/public", "/online/public/table/{tableId}",
            "/tutorial", "/rules", "/settings", "/settings/email", "/stats", "/sign-in", "/privacy"})
    String selectedMode() {
        return "forward:/index.html";
    }
}
