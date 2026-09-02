package com.beelot.application;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
class HomeController {

    @GetMapping({"/play/ai", "/play/ai/bidding/{gameId}", "/play/ai/game/{gameId}", "/online/private", "/online/private/table/{tableId}", "/tutorial", "/rules", "/settings"})
    String selectedMode() {
        return "forward:/index.html";
    }
}
