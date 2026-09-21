package com.beelot.application.security;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
class SecurityExceptionHandler {

    @ExceptionHandler(CapacityExceededException.class)
    ResponseEntity<Map<String, String>> capacityExceeded(CapacityExceededException exception) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .header("Retry-After", "60")
                .body(Map.of("message", exception.getMessage()));
    }
}
