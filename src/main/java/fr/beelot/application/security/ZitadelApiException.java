package fr.beelot.application.security;

/** A call to Zitadel's API failed. The message never holds the token or Zitadel's answer, which may hold an address. */
public class ZitadelApiException extends RuntimeException {

    /** @param status the HTTP status, or 0 when Zitadel could not be reached */
    public ZitadelApiException(String method, String path, int status) {
        super("Zitadel answered " + status + " to " + method + " " + path);
    }
}
