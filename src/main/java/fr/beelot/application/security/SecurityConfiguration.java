package fr.beelot.application.security;

import fr.beelot.application.account.SignInSuccessHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.oidc.IdTokenClaimNames;
import org.springframework.security.web.SecurityFilterChain;
import tools.jackson.databind.json.JsonMapper;

import java.util.Map;
import java.util.Set;

/**
 * Every page and game endpoint stays open to guests; players may sign in through Zitadel (US-075), which tells Beelot
 * nothing but the player's user id. Signing in starts a session, so requests that change state must then carry the
 * CSRF token, which the client reads from the {@code XSRF-TOKEN} cookie. Guests have no session to abuse, so their
 * requests need no token.
 */
@Configuration
public class SecurityConfiguration {

    public static final String REGISTRATION_ID = "zitadel";

    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, SignInSuccessHandler signInSuccessHandler,
                                            ClientRegistrationRepository registrations, JsonMapper json)
            throws Exception {
        return http.authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
                .csrf(csrf -> csrf.spa().requireCsrfProtectionMatcher(request ->
                        !SAFE_METHODS.contains(request.getMethod()) && request.getSession(false) != null))
                .oauth2Login(login -> login.loginPage("/")
                        .authorizationEndpoint(endpoint -> endpoint
                                .authorizationRequestResolver(new RegisterAuthorizationRequestResolver(registrations)))
                        .successHandler(signInSuccessHandler)
                        .failureUrl("/?signin=failed"))
                .logout(logout -> logout.logoutUrl("/logout")
                        .logoutSuccessHandler(new ZitadelLogoutSuccessHandler(registrations, json)))
                .build();
    }

    @Bean
    ZitadelProperties zitadelProperties(@Value("${beelot.zitadel.issuer:}") String issuer,
                                        @Value("${beelot.zitadel.client-id:}") String clientId,
                                        @Value("${beelot.zitadel.client-secret:}") String clientSecret) {
        return new ZitadelProperties(issuer, clientId, clientSecret);
    }

    /**
     * The Zitadel client when it is configured, else none, and sign-in is not offered. It is built from the issuer
     * rather than discovered, so the server starts even while Zitadel is unreachable.
     */
    @Bean
    ClientRegistrationRepository clientRegistrationRepository(ZitadelProperties zitadel) {
        ClientRegistration registration = zitadel.configured() ? zitadelRegistration(zitadel) : null;
        return registrationId -> registration != null && registration.getRegistrationId().equals(registrationId)
                ? registration : null;
    }

    /** Asks for the {@code openid} scope only: the user id is all Beelot learns about a player. */
    static ClientRegistration zitadelRegistration(ZitadelProperties zitadel) {
        String issuer = zitadel.issuer().replaceAll("/+$", "");
        return ClientRegistration.withRegistrationId(REGISTRATION_ID)
                .clientName("Zitadel")
                .clientId(zitadel.clientId())
                .clientSecret(zitadel.clientSecret())
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .scope("openid")
                .issuerUri(issuer)
                .authorizationUri(issuer + "/oauth/v2/authorize")
                .tokenUri(issuer + "/oauth/v2/token")
                .jwkSetUri(issuer + "/oauth/v2/keys")
                .userNameAttributeName(IdTokenClaimNames.SUB)
                .providerConfigurationMetadata(Map.of("end_session_endpoint", issuer + "/oidc/v1/end_session"))
                .build();
    }
}
