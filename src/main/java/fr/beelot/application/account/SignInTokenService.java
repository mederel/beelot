package fr.beelot.application.account;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.ott.DefaultOneTimeToken;
import org.springframework.security.authentication.ott.GenerateOneTimeTokenRequest;
import org.springframework.security.authentication.ott.OneTimeToken;
import org.springframework.security.authentication.ott.OneTimeTokenAuthenticationToken;
import org.springframework.security.authentication.ott.OneTimeTokenService;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

/**
 * Sign-in link tokens (US-075, ADR-004), made by {@link Tokens}. A token works once and only while it is fresh.
 */
@Component
public class SignInTokenService implements OneTimeTokenService {

    private static final Logger LOG = LoggerFactory.getLogger(SignInTokenService.class);
    private static final Duration PURGE_AFTER = Duration.ofDays(1);

    private final JdbcClient jdbc;
    private final Clock clock;
    private final Duration lifetime;

    public SignInTokenService(JdbcClient jdbc, Clock clock,
                              @Value("${beelot.sign-in.link-lifetime:PT15M}") Duration lifetime) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.lifetime = lifetime;
    }

    /** Stores a new token for the request's username (the address); the request's own lifetime is ignored. */
    @Override
    public OneTimeToken generate(GenerateOneTimeTokenRequest request) {
        String clearToken = Tokens.newToken();
        Instant expiresAt = clock.instant().plus(lifetime);
        jdbc.sql("INSERT INTO sign_in_token (token_hash, email, expires_at) VALUES (?, ?, ?)")
                .params(Tokens.hash(clearToken), request.getUsername(), toUtc(expiresAt))
                .update();
        return new DefaultOneTimeToken(clearToken, request.getUsername(), expiresAt);
    }

    /** Spends the token. Returns it only if this call deleted it and it had not expired; otherwise null. */
    @Override
    @Transactional
    public OneTimeToken consume(OneTimeTokenAuthenticationToken authenticationToken) {
        String clearToken = authenticationToken.getTokenValue();
        String hash = Tokens.hash(clearToken);
        var found = jdbc.sql("SELECT email, expires_at FROM sign_in_token WHERE token_hash = ?")
                .param(hash)
                .query((rs, n) -> new Stored(rs.getString("email"),
                        rs.getObject("expires_at", LocalDateTime.class).toInstant(ZoneOffset.UTC)))
                .optional();
        if (found.isEmpty()) {
            return null;
        }
        int deleted = jdbc.sql("DELETE FROM sign_in_token WHERE token_hash = ?").param(hash).update();
        Stored stored = found.get();
        if (deleted != 1 || !stored.expiresAt().isAfter(clock.instant())) {
            return null;
        }
        return new DefaultOneTimeToken(clearToken, stored.email(), stored.expiresAt());
    }

    /** Removes tokens that expired more than a day ago; returns how many. */
    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT1M")
    int purgeExpired() {
        int deleted = jdbc.sql("DELETE FROM sign_in_token WHERE expires_at < ?")
                .param(toUtc(clock.instant().minus(PURGE_AFTER)))
                .update();
        if (deleted > 0) {
            LOG.info("Purged {} expired sign-in tokens", deleted);
        }
        return deleted;
    }


    private static LocalDateTime toUtc(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private record Stored(String email, Instant expiresAt) {
    }
}
