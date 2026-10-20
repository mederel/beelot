package fr.beelot.application.security;

import fr.beelot.application.account.PasskeyRateLimiter;
import fr.beelot.application.account.PasskeyRequestFilter;
import fr.beelot.application.account.RelyingParty;
import fr.beelot.application.account.SignInSuccessHandler;
import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.privacy.SecurityEvents.Type;
import fr.beelot.application.privacy.SecurityEvents.Outcome;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.ObjectPostProcessor;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.session.HttpSessionEventPublisher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.security.web.webauthn.authentication.WebAuthnAuthenticationFilter;

import java.time.Clock;
import java.util.Set;
import java.util.UUID;

/**
 * Every page and game endpoint stays open to guests. Signing in starts a session, so requests that change state must
 * then carry the CSRF token, which the client reads from the {@code XSRF-TOKEN} cookie. Guests have no session to
 * abuse, so their requests need no token; signing up and signing in with a passkey (US-084) need it all the same.
 * A player has the one passkey made when signing up: Spring Security's endpoints to register more are closed.
 */
@Configuration
public class SecurityConfiguration {

    private static final Logger LOG = LoggerFactory.getLogger(SecurityConfiguration.class);
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");
    /** Signing up and signing in start a session, so they need the token even without one. */
    private static final RequestMatcher SIGN_UP_AND_SIGN_IN = new OrRequestMatcher(
            PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, "/api/sign-up/options"),
            PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, "/api/sign-up"),
            PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, "/webauthn/authenticate/options"),
            PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, "/login/webauthn"));
    /**
     * Spring's own passkey registration, closed by a filter of its own as well as by the authorization rules: Spring
     * answers the registration options before authorizing the request.
     */
    private static final RequestMatcher REGISTRATION =
            PathPatternRequestMatcher.withDefaults().matcher("/webauthn/register/**");

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityEvents events, Clock clock,
                                            CsrfTokenRepository csrfTokens, RelyingParty relyingParty,
                                            SignInSuccessHandler signIn, PasskeyRateLimiter rateLimiter) throws Exception {
        return http.authorizeHttpRequests(requests -> requests
                        // An account has one passkey, made when signing up: Spring's own registration is closed.
                        .requestMatchers("/webauthn/register", "/webauthn/register/**").denyAll()
                        .anyRequest().permitAll())
                .csrf(csrf -> csrf.spa().csrfTokenRepository(csrfTokens)
                        .requireCsrfProtectionMatcher(request -> !SAFE_METHODS.contains(request.getMethod())
                                && (request.getSession(false) != null || SIGN_UP_AND_SIGN_IN.matches(request))))
                .webAuthn(webAuthn -> webAuthn.rpName("Beelot")
                        .rpId(relyingParty.id())
                        .allowedOrigins(relyingParty.origin())
                        .disableDefaultRegistrationPage(true)
                        .withObjectPostProcessor(new ObjectPostProcessor<WebAuthnAuthenticationFilter>() {
                            @Override
                            public <O extends WebAuthnAuthenticationFilter> O postProcess(O filter) {
                                filter.setAuthenticationSuccessHandler(signIn);
                                filter.setAuthenticationFailureHandler((request, response, failure) -> {
                                    // Never why: the player learns nothing about the passkeys Beelot knows.
                                    LOG.debug("Sign-in failed: {}", failure.getClass().getSimpleName());
                                    events.record(Type.SIGN_IN, Outcome.FAILURE, null, request.getRemoteAddr());
                                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                                });
                                return filter;
                            }
                        }))
                .addFilterBefore(new PasskeyRequestFilter(rateLimiter, events), CsrfFilter.class)
                .addFilterAfter((request, response, chain) -> {
                    if (REGISTRATION.matches((HttpServletRequest) request)) {
                        ((HttpServletResponse) response).setStatus(HttpServletResponse.SC_FORBIDDEN);
                    } else {
                        chain.doFilter(request, response);
                    }
                }, CsrfFilter.class)
                .headers(headers -> headers.referrerPolicy(referrer -> referrer.policy(ReferrerPolicy.NO_REFERRER)))
                .addFilterBefore(new SessionLifetimeFilter(clock), SecurityContextHolderFilter.class)
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

    /** The CSRF token in the {@code XSRF-TOKEN} cookie, readable by the client, as {@code spa()} sets it up. */
    @Bean
    CsrfTokenRepository csrfTokenRepository() {
        return CookieCsrfTokenRepository.withHttpOnlyFalse();
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
}
