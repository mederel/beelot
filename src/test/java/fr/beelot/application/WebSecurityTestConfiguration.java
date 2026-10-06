package fr.beelot.application;

import fr.beelot.application.account.AccountService;
import fr.beelot.application.account.SignInSuccessHandler;
import fr.beelot.application.security.SecurityConfiguration;
import org.mockito.Mockito;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

/**
 * The application's security rules for {@code @WebMvcTest} slices, which do not load them by themselves, with an
 * account service that needs no database.
 */
@TestConfiguration(proxyBeanMethods = false)
@Import({SecurityConfiguration.class, SignInSuccessHandler.class})
public class WebSecurityTestConfiguration {

    @Bean
    AccountService accountService() {
        return Mockito.mock(AccountService.class);
    }
}
