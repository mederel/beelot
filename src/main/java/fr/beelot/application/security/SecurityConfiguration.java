package fr.beelot.application.security;

import fr.beelot.application.account.SignInSuccessHandler;
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
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;

import java.util.Map;
import java.util.Set;

/**
 * Every page and game endpoint stays open to guests; players may sign in with a configured OAuth provider (US-057).
 * Signing in starts a session, so requests that change state must then carry the CSRF token, which the client reads
 * from the {@code XSRF-TOKEN} cookie. Guests have no session to abuse, so their requests need no token.
 */
@Configuration
@ImportRuntimeHints(SecurityConfiguration.Hints.class)
public class SecurityConfiguration {

    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, SignInSuccessHandler signInSuccessHandler)
            throws Exception {
        return http.authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
                .csrf(csrf -> csrf.spa().requireCsrfProtectionMatcher(request ->
                        !SAFE_METHODS.contains(request.getMethod()) && request.getSession(false) != null))
                .oauth2Login(login -> login.loginPage("/").successHandler(signInSuccessHandler))
                .logout(logout -> logout.logoutUrl("/logout")
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
                .build();
    }

    /**
     * The providers configured under {@code spring.security.oauth2.client}, read when the application starts. Spring
     * Boot's own repository is only created when providers are configured, which a native image decides once, when it
     * is built; provider credentials come from the environment where the application runs, so this one may be empty.
     */
    @Bean
    ClientRegistrationRepository clientRegistrationRepository(Environment environment) {
        OAuth2ClientProperties properties = Binder.get(environment)
                .bind("spring.security.oauth2.client", OAuth2ClientProperties.class)
                .orElseGet(OAuth2ClientProperties::new);
        properties.afterPropertiesSet();
        Map<String, ClientRegistration> registrations = new OAuth2ClientPropertiesMapper(properties)
                .asClientRegistrations();
        return registrations::get;
    }

    /** Binding the OAuth client properties at run time needs them in the native image. */
    static class Hints implements RuntimeHintsRegistrar {

        @Override
        public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
            BindableRuntimeHintsRegistrar.forTypes(OAuth2ClientProperties.class).registerHints(hints);
        }
    }
}
