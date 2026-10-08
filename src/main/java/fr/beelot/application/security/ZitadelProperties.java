package fr.beelot.application.security;

/**
 * Where players sign in: the Zitadel issuer URL and Beelot's OpenID Connect client (US-075). Sign-in is offered only
 * when all three are set. The API token belongs to the service account of the scheduled jobs, which run only when it
 * and the issuer are set (US-076).
 */
public record ZitadelProperties(String issuer, String clientId, String clientSecret, String apiToken) {

    public boolean configured() {
        return isSet(issuer) && isSet(clientId) && isSet(clientSecret);
    }

    public boolean apiConfigured() {
        return isSet(issuer) && isSet(apiToken);
    }

    private static boolean isSet(String value) {
        return value != null && !value.isBlank();
    }
}
