package fr.beelot.application.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.util.Map;

/**
 * After the Spring session ends, tells the client where to end the Zitadel session too, so that the next "Sign in" on
 * a shared device asks for credentials again. Without a Zitadel session, the client simply returns home.
 */
class ZitadelLogoutSuccessHandler implements LogoutSuccessHandler {

    private final ClientRegistrationRepository registrations;
    private final JsonMapper json;

    ZitadelLogoutSuccessHandler(ClientRegistrationRepository registrations, JsonMapper json) {
        this.registrations = registrations;
        this.json = json;
    }

    @Override
    public void onLogoutSuccess(HttpServletRequest request, HttpServletResponse response,
                                Authentication authentication) throws IOException {
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        json.writeValue(response.getOutputStream(), Map.of("logoutUrl", logoutUrl(request, authentication)));
    }

    private String logoutUrl(HttpServletRequest request, Authentication authentication) {
        if (!(authentication instanceof OAuth2AuthenticationToken token)
                || !(token.getPrincipal() instanceof OidcUser user)) {
            return "/";
        }
        ClientRegistration registration = registrations.findByRegistrationId(token.getAuthorizedClientRegistrationId());
        Object endSession = registration == null ? null
                : registration.getProviderDetails().getConfigurationMetadata().get("end_session_endpoint");
        if (endSession == null) return "/";
        String home = ServletUriComponentsBuilder.fromContextPath(request).path("/").build().toUriString();
        return UriComponentsBuilder.fromUriString(endSession.toString())
                .queryParam("id_token_hint", "{idToken}")
                .queryParam("client_id", "{clientId}")
                .queryParam("post_logout_redirect_uri", "{home}")
                .encode()
                .buildAndExpand(user.getIdToken().getTokenValue(), registration.getClientId(), home)
                .toUriString();
    }
}
