package fr.beelot.application.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

import java.util.HashMap;
import java.util.Map;

/**
 * Starts the sign-in flow, and opens Zitadel's registration form instead of its sign-in page when the link carries
 * the {@code register} parameter ("Create an account", US-075).
 */
class RegisterAuthorizationRequestResolver implements OAuth2AuthorizationRequestResolver {

    private static final String REGISTER_PARAMETER = "register";

    private final DefaultOAuth2AuthorizationRequestResolver defaultResolver;

    RegisterAuthorizationRequestResolver(ClientRegistrationRepository registrations) {
        this.defaultResolver = new DefaultOAuth2AuthorizationRequestResolver(registrations, "/oauth2/authorization");
    }

    @Override
    public OAuth2AuthorizationRequest resolve(HttpServletRequest request) {
        return withPrompt(request, defaultResolver.resolve(request));
    }

    @Override
    public OAuth2AuthorizationRequest resolve(HttpServletRequest request, String clientRegistrationId) {
        return withPrompt(request, defaultResolver.resolve(request, clientRegistrationId));
    }

    private static OAuth2AuthorizationRequest withPrompt(HttpServletRequest request,
                                                        OAuth2AuthorizationRequest authorizationRequest) {
        if (authorizationRequest == null || request.getParameter(REGISTER_PARAMETER) == null) {
            return authorizationRequest;
        }
        Map<String, Object> parameters = new HashMap<>(authorizationRequest.getAdditionalParameters());
        parameters.put("prompt", "create");
        return OAuth2AuthorizationRequest.from(authorizationRequest).additionalParameters(parameters).build();
    }
}
