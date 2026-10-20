package fr.beelot.application.security;

import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.privacy.SecurityEvents.Type;
import fr.beelot.application.privacy.SecurityEvents.Outcome;
import jakarta.servlet.http.HttpSession;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.session.HttpSessionEventPublisher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

import java.time.Clock;
import java.util.Set;
import java.util.UUID;

/**
 * Every page and game endpoint stays open to guests. Signing in starts a session, so requests that change state must
 * then carry the CSRF token, which the client reads from the {@code XSRF-TOKEN} cookie. Guests have no session to
 * abuse, so their requests need no token; signing up with a passkey (US-084) needs it all the same.
 */
@Configuration
public class SecurityConfiguration {

    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");
    /** Signing up starts a session, so it needs the token even without one, as signing in will. */
    private static final RequestMatcher SIGN_UP = new OrRequestMatcher(
            PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, "/api/sign-up/options"),
            PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, "/api/sign-up"));

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityEvents events, Clock clock,
                                            CsrfTokenRepository csrfTokens) throws Exception {
        return http.authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
                .csrf(csrf -> csrf.spa().csrfTokenRepository(csrfTokens)
                        .requireCsrfProtectionMatcher(request -> !SAFE_METHODS.contains(request.getMethod())
                                && (request.getSession(false) != null || SIGN_UP.matches(request))))
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
