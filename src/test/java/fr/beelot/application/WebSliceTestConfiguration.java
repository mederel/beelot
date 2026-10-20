package fr.beelot.application;

import fr.beelot.application.account.AccountService;
import fr.beelot.application.account.SignInRateLimiter;
import fr.beelot.application.account.SignInSuccessHandler;
import fr.beelot.application.history.MatchRecorder;
import fr.beelot.application.privacy.AccountSessions;
import fr.beelot.application.privacy.SecurityEvents;
import fr.beelot.application.security.SecurityConfiguration;
import org.mockito.Mockito;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

/**
 * The application's security rules for {@code @WebMvcTest} slices, which do not load them by themselves, with an
 * account service, a match history and a security event log that need no database.
 */
@TestConfiguration(proxyBeanMethods = false)
@Import({SecurityConfiguration.class, SignInSuccessHandler.class, SignInRateLimiter.class})
public class WebSliceTestConfiguration {

    @Bean
    AccountService accountService() {
        return Mockito.mock(AccountService.class);
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
