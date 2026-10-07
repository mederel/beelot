package fr.beelot.application.security;

/**
 * Where players sign in: the Zitadel issuer URL and Beelot's OpenID Connect client (US-075). Sign-in is offered only
 * when all three are set.
 */
public record ZitadelProperties(String issuer, String clientId, String clientSecret) {

    public boolean configured() {
        return isSet(issuer) && isSet(clientId) && isSet(clientSecret);
    }

    private static boolean isSet(String value) {
        return value != null && !value.isBlank();
    }
}
