package com.beelot.application.security;

/** Thrown when the server holds as many games or tables as it is willing to keep in memory. */
public class CapacityExceededException extends RuntimeException {

    public CapacityExceededException(String message) {
        super(message);
    }
}
