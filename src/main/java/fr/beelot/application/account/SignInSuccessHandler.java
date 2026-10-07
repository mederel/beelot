package fr.beelot.application.account;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/** Records the account on each sign-in, then returns the player to the home screen. */
@Component
public class SignInSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final AccountService accounts;

    SignInSuccessHandler(AccountService accounts) {
        super("/");
        setAlwaysUseDefaultTargetUrl(true);
        this.accounts = accounts;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {
        if (authentication instanceof OAuth2AuthenticationToken token) {
            accounts.signIn(token.getAuthorizedClientRegistrationId(), token.getName(), request.getLocale());
        }
        super.onAuthenticationSuccess(request, response, authentication);
    }
}
