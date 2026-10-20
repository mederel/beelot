package fr.beelot.application;

import fr.beelot.application.account.AccountService;
import fr.beelot.application.account.RelyingParty;
import fr.beelot.application.account.PasskeyRateLimiter;
import fr.beelot.application.account.SignInSuccessHandler;
import fr.beelot.application.history.MatchRecorder;
import fr.beelot.application.privacy.AccountSessions;
import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.security.SecurityConfiguration;
import org.mockito.Mockito;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.userdetails.UserDetailsService;

/**
 * The application's security rules for {@code @WebMvcTest} slices, which do not load them by themselves, with an
 * account service, a match history, a security event log and passkey users that need no database.
 */
@TestConfiguration(proxyBeanMethods = false)
@Import({SecurityConfiguration.class, SignInSuccessHandler.class, PasskeyRateLimiter.class})
public class WebSliceTestConfiguration {

    @Bean
    AccountService accountService() {
        return Mockito.mock(AccountService.class);
    }

    @Bean
    RelyingParty relyingParty() {
        return RelyingParty.of("http://localhost");
    }

    @Bean
    UserDetailsService userDetailsService() {
        return Mockito.mock(UserDetailsService.class);
    }

    @Bean
    SecurityEvents securityEvents() {
        return Mockito.mock(SecurityEvents.class);
    }

    @Bean
    AccountSessions accountSessions() {
        return Mockito.mock(AccountSessions.class);
    }

    @Bean
    MatchRecorder matchRecorder() {
        return MatchRecorder.NONE;
    }
}
