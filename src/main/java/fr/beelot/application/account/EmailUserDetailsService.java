package fr.beelot.application.account;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;

/**
 * The player behind a sign-in link: any address, with no password and the {@code EMAIL_USER} authority. It is asked
 * only after a token has been checked and used, so the address can be trusted. Not a {@code @Component}: a
 * {@code UserDetailsService} bean would also become Spring Security's global username/password login, so the security
 * chain hands this one to the one-time-token login alone.
 */
public class EmailUserDetailsService implements UserDetailsService {

    @Override
    public UserDetails loadUserByUsername(String email) {
        return User.withUsername(email).password("").authorities("EMAIL_USER").build();
    }
}
