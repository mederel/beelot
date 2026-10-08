package fr.beelot.application.security;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Zitadel's user API, called with the token of the scheduled jobs' service account (US-076). Zitadel's answers hold
 * names and email addresses: only the user id, the creation date and whether the address is verified are read.
 */
@RegisterReflectionForBinding({ZitadelUsers.Page.class, ZitadelUsers.Details.class, ZitadelUsers.User.class,
        ZitadelUsers.UserDetails.class, ZitadelUsers.Human.class, ZitadelUsers.Email.class})
public class ZitadelUsers {

    private static final String USERS = "/v2/users";
    private static final int PAGE_SIZE = 100;

    private final RestClient client;

    public ZitadelUsers(ZitadelProperties zitadel) {
        this(zitadel, RestClient.builder());
    }

    ZitadelUsers(ZitadelProperties zitadel, RestClient.Builder builder) {
        String issuer = zitadel.issuer() == null ? "" : zitadel.issuer().replaceAll("/+$", "");
        this.client = builder.baseUrl(issuer)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + zitadel.apiToken())
                .build();
    }

    /** The ids of the human users created before the cutoff whose email address is not verified, oldest first. */
    public List<String> unconfirmedCreatedBefore(Instant cutoff) {
        List<String> ids = new ArrayList<>();
        for (long offset = 0; ; offset += PAGE_SIZE) {
            Page page = page(offset);
            List<User> users = page.result() == null ? List.of() : page.result();
            for (User user : users) {
                Instant created = user.details() == null ? null : user.details().creationDate();
                if (created == null) {
                    continue;
                }
                if (!created.isBefore(cutoff)) {
                    return ids;
                }
                if (user.unconfirmed()) {
                    ids.add(user.userId());
                }
            }
            long total = page.details() == null ? 0 : page.details().totalResult();
            if (users.isEmpty() || offset + PAGE_SIZE >= total) {
                return ids;
            }
        }
    }

    /** Deletes the user; a user already gone is not an error. */
    public void delete(String userId) {
        String path = USERS + "/" + userId;
        try {
            client.delete().uri(USERS + "/{id}", userId)
                    .retrieve()
                    .onStatus(status -> status.isError() && status.value() != HttpStatus.NOT_FOUND.value(),
                            (request, response) -> fail("DELETE", path, response.getStatusCode()))
                    .onStatus(status -> status.value() == HttpStatus.NOT_FOUND.value(), (request, response) -> { })
                    .toBodilessEntity();
        } catch (RestClientException e) {
            throw new ZitadelApiException("DELETE", path, 0);
        }
    }

    private Page page(long offset) {
        Map<String, Object> body = Map.of(
                "query", Map.of("offset", offset, "limit", PAGE_SIZE, "asc", true),
                "sortingColumn", "USER_FIELD_NAME_CREATION_DATE",
                "queries", List.of(Map.of("typeQuery", Map.of("type", "TYPE_HUMAN"))));
        try {
            Page page = client.post().uri(USERS)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError,
                            (request, response) -> fail("POST", USERS, response.getStatusCode()))
                    .body(Page.class);
            return page == null ? new Page(null, null) : page;
        } catch (RestClientException e) {
            throw new ZitadelApiException("POST", USERS, 0);
        }
    }

    private static void fail(String method, String path, HttpStatusCode status) {
        throw new ZitadelApiException(method, path, status.value());
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Page(Details details, List<User> result) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Details(long totalResult) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record User(String userId, UserDetails details, Human human) {

        boolean unconfirmed() {
            // Protobuf JSON may leave out a false flag, so only an explicit true counts as verified.
            return human != null && human.email() != null && !Boolean.TRUE.equals(human.email().verified());
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record UserDetails(Instant creationDate) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Human(Email email) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Email(@JsonProperty("isVerified") Boolean verified) {
    }
}
