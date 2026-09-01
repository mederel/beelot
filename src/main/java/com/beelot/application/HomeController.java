package com.beelot.application;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
class HomeController {

    @GetMapping({"/play/ai", "/online/private", "/tutorial", "/rules"})
    String selectedMode() {
        return "forward:/index.html";
    }
}
