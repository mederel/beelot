package fr.beelot.application.security;

import fr.beelot.application.account.EmailUserDetailsService;
import fr.beelot.application.account.SignInLinkSender;
import fr.beelot.application.account.SignInRateLimiter;
import fr.beelot.application.account.SignInRequestFilter;
import fr.beelot.application.account.SignInSuccessHandler;
import fr.beelot.application.account.SignInTokenService;
import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.privacy.SecurityEvents.Outcome;
import fr.beelot.application.privacy.SecurityEvents.Type;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.boot.context.properties.bind.BindableRuntimeHintsRegistrar;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.security.oauth2.client.autoconfigure.OAuth2ClientProperties;
import org.springframework.boot.security.oauth2.client.autoconfigure.OAuth2ClientPropertiesMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ImportRuntimeHints;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.ott.OneTimeTokenAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.ott.GenerateOneTimeTokenFilter;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.session.HttpSessionEventPublisher;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.util.StringUtils;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Every page and game endpoint stays open to guests; players may sign in with a link sent by email, or with Google or
 * GitHub (US-075, ADR-004). Signing in starts a session, so requests that change state must then carry the CSRF token,
 * which the client reads from the {@code XSRF-TOKEN} cookie. Guests have no session to abuse, so their requests need
 * no token, except the two that sign in with a link: requesting the link and posting its token.
 */
@Configuration
@ImportRuntimeHints(SecurityConfiguration.Hints.class)
public class SecurityConfiguration {

    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");
    private static final String LINK_LOGIN_URL = "/login/ott";
    private static final RequestMatcher LINK_SIGN_IN = new OrRequestMatcher(SignInRequestFilter.MATCHER,
            PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, LINK_LOGIN_URL),
            // Confirming a change of address signs the browser in, so it is protected like a sign-in (US-079).
            PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, "/api/account/email/confirm"));

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, SignInSuccessHandler signInSuccessHandler,
                                            SignInTokenService signInTokenService, SignInLinkSender signInLinkSender,
                                            SignInRateLimiter signInRateLimiter, JsonMapper json,
                                            SecurityEvents events, Clock clock) throws Exception {
        SimpleUrlAuthenticationFailureHandler providerFailure =
                new SimpleUrlAuthenticationFailureHandler("/?signin=failed");
        return http.authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
                .csrf(csrf -> csrf.spa().requireCsrfProtectionMatcher(request -> LINK_SIGN_IN.matches(request)
                        || !SAFE_METHODS.contains(request.getMethod()) && request.getSession(false) != null))
                .headers(headers -> headers.referrerPolicy(referrer -> referrer.policy(ReferrerPolicy.NO_REFERRER)))
                // The client has its own sign-in panel: a login page keeps Spring from generating one at /login.
                // The processing URL is set before loginPage, which would otherwise default it to "/".
                .oneTimeTokenLogin(ott -> ott.loginProcessingUrl(LINK_LOGIN_URL)
                        .loginPage("/")
                        .tokenGeneratingUrl(SignInRequestFilter.PATH)
                        .tokenGenerationSuccessHandler(signInLinkSender)
                        .tokenService(signInTokenService)
                        // The address is trusted only once its token is used: the lookup serves this login alone.
                        .authenticationProvider(new OneTimeTokenAuthenticationProvider(signInTokenService,
                                new EmailUserDetailsService()))
                        .showDefaultSubmitPage(false)
                        .successHandler(signInSuccessHandler)
                        .failureHandler((request, response, failure) -> {
                            events.record(Type.SIGN_IN, Outcome.FAILURE, null, request.getRemoteAddr());
                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                        }))
                .addFilterBefore(new SessionLifetimeFilter(clock), SecurityContextHolderFilter.class)
                .addFilterBefore(new SignInRequestFilter(signInRateLimiter, json, events),
                        GenerateOneTimeTokenFilter.class)
                .oauth2Login(login -> login.loginPage("/")
                        .successHandler(signInSuccessHandler)
                        .failureHandler((request, response, failure) -> {
                            events.record(Type.SIGN_IN, Outcome.FAILURE, null, request.getRemoteAddr());
                            providerFailure.onAuthenticationFailure(request, response, failure);
                        }))
                .logout(logout -> logout.logoutUrl("/logout")
                        // Runs before the session is invalidated, which then does not count as an expiry.
                        .addLogoutHandler((request, response, authentication) -> {
                            HttpSession session = request.getSession(false);
                            if (session != null) {
                                session.setAttribute(SecurityEvents.ENDED, true);
                                UUID account = session.getAttribute(SecurityEvents.ACCOUNT_ID) instanceof UUID id
                                        ? id : null;
                                events.record(Type.SIGN_OUT, Outcome.SUCCESS, account, request.getRemoteAddr());
                            }
                        })
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
                .build();
    }

    /** Publishes the end of each session, so that expiries are recorded and ended sessions forgotten. */
    @Bean
    HttpSessionEventPublisher httpSessionEventPublisher() {
        return new HttpSessionEventPublisher();
    }

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    /**
     * The providers configured under {@code spring.security.oauth2.client}, read when the application starts. Spring
     * Boot's own repository is only created when providers are configured, which a native image decides once, when it
     * is built; provider credentials come from the environment where the application runs, so this one may be empty.
     * A provider is offered only once both its client id and secret are set; until then its other settings, such as
     * Google's scope, are ignored. GitHub is asked for no scope: the user id needs none.
     */
    @Bean
    ClientRegistrationRepository clientRegistrationRepository(Environment environment) {
        OAuth2ClientProperties properties = Binder.get(environment)
                .bind("spring.security.oauth2.client", OAuth2ClientProperties.class)
                .orElseGet(OAuth2ClientProperties::new);
        properties.getRegistration().values().removeIf(registration -> !StringUtils.hasText(registration.getClientId())
                || !StringUtils.hasText(registration.getClientSecret()));
        properties.afterPropertiesSet();
        Map<String, ClientRegistration> registrations = new HashMap<>(new OAuth2ClientPropertiesMapper(properties)
                .asClientRegistrations());
        registrations.computeIfPresent("github", (id, github) -> withoutScopes(github));
        return registrations::get;
    }

    /**
     * The same registration, asking for no scope. Neither an empty property nor the builder's {@code scope} method
     * can drop Spring Boot's {@code read:user} default for GitHub: both ignore an empty set, so it is rebuilt.
     */
    static ClientRegistration withoutScopes(ClientRegistration registration) {
        ClientRegistration.ProviderDetails provider = registration.getProviderDetails();
        return ClientRegistration.withRegistrationId(registration.getRegistrationId())
                .clientId(registration.getClientId())
                .clientSecret(registration.getClientSecret())
                .clientAuthenticationMethod(registration.getClientAuthenticationMethod())
                .authorizationGrantType(registration.getAuthorizationGrantType())
                .redirectUri(registration.getRedirectUri())
                .clientName(registration.getClientName())
                .clientSettings(registration.getClientSettings())
                .authorizationUri(provider.getAuthorizationUri())
                .tokenUri(provider.getTokenUri())
                .userInfoUri(provider.getUserInfoEndpoint().getUri())
                .userInfoAuthenticationMethod(provider.getUserInfoEndpoint().getAuthenticationMethod())
                .userNameAttributeName(provider.getUserInfoEndpoint().getUserNameAttributeName())
                .jwkSetUri(provider.getJwkSetUri())
                .issuerUri(provider.getIssuerUri())
                .providerConfigurationMetadata(provider.getConfigurationMetadata())
                .build();
    }

    /** Binding the OAuth client properties at run time needs them in the native image. */
    static class Hints implements RuntimeHintsRegistrar {

        @Override
        public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
            BindableRuntimeHintsRegistrar.forTypes(OAuth2ClientProperties.class).registerHints(hints);
        }
    }
}
