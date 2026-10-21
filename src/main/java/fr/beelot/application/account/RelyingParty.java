package fr.beelot.application.account;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * Beelot as the relying party of passkeys (US-084): the host players reach it at, which a passkey is bound to, and
 * the one origin its pages are served from.
 */
public record RelyingParty(String id, String origin) {

    /** The relying party of {@code BEELOT_PUBLIC_URL}, such as {@code https://beelot.fr}; its path is ignored. */
    public static RelyingParty of(String publicUrl) {
        URI url;
        try {
            url = new URI(publicUrl);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("Not a URL: " + publicUrl, e);
        }
        String scheme = url.getScheme();
        String host = url.getHost();
        if (scheme == null || host == null) {
            throw new IllegalArgumentException("Not an absolute http(s) URL: " + publicUrl);
        }
        scheme = scheme.toLowerCase(Locale.ROOT);
        // Browsers send the origin, and check the rp id, in lower case.
        host = host.toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) {
            throw new IllegalArgumentException("Not an absolute http(s) URL: " + publicUrl);
        }
        int port = url.getPort();
        boolean defaultPort = port == -1 || port == (scheme.equals("https") ? 443 : 80);
        return new RelyingParty(host, scheme + "://" + host + (defaultPort ? "" : ":" + port));
    }
}
