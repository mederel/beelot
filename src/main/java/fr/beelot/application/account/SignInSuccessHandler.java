package fr.beelot.application.account;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.ott.OneTimeTokenAuthentication;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Records the account on each sign-in. A player signing in with a provider returns to the home screen; the client
 * posts the token of a sign-in link itself, and gets 204.
 */
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
        if (authentication instanceof OneTimeTokenAuthentication) {
            accounts.signInWithEmail(authentication.getName(), SignInEmail.language(request));
            clearAuthenticationAttributes(request);
            response.setStatus(HttpServletResponse.SC_NO_CONTENT);
            return;
        }
        if (authentication instanceof OAuth2AuthenticationToken token) {
            accounts.signIn(token.getAuthorizedClientRegistrationId(), token.getName(), SignInEmail.language(request));
        }
        super.onAuthenticationSuccess(request, response, authentication);
    }
}
