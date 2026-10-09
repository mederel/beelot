package fr.beelot.application.security;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** Lists the users who never confirmed their address and deletes them, through Zitadel's user API (US-076). */
class ZitadelUsersTest {

    private static final Instant CUTOFF = Instant.parse("2026-10-01T00:00:00Z");

    private final RestClient.Builder builder = RestClient.builder();
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

    private ZitadelUsers users(String issuer) {
        return new ZitadelUsers(new ZitadelProperties(issuer, "", "", "api-token"), builder);
    }

    @Test
    void listsUnconfirmedHumansOldestFirst() {
        ZitadelUsers users = users("https://zitadel.test");
        server.expect(requestTo("https://zitadel.test/v2/users"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer api-token"))
                .andExpect(jsonPath("$.query.offset").value(0))
                .andExpect(jsonPath("$.query.limit").value(100))
                .andExpect(jsonPath("$.query.asc").value(true))
                .andExpect(jsonPath("$.sortingColumn").value("USER_FIELD_NAME_CREATION_DATE"))
                .andExpect(jsonPath("$.queries[0].typeQuery.type").value("TYPE_HUMAN"))
                .andRespond(page(2, user("u1", "2026-09-01T00:00:00Z", false),
                        user("u2", "2026-09-02T00:00:00Z", true)));

        assertEquals(List.of("u1"), users.unconfirmedCreatedBefore(CUTOFF));
        server.verify();
    }

    @Test
    void readsTheNextPage() {
        ZitadelUsers users = users("https://zitadel.test");
        String[] first = IntStream.range(0, 100)
                .mapToObj(i -> user("u" + i, "2026-09-01T00:00:00Z", false)).toArray(String[]::new);
        server.expect(requestTo("https://zitadel.test/v2/users"))
                .andExpect(jsonPath("$.query.offset").value(0))
                .andRespond(page(101, first));
        server.expect(requestTo("https://zitadel.test/v2/users"))
                .andExpect(jsonPath("$.query.offset").value(100))
                .andRespond(page(101, user("u-last", "2026-09-02T00:00:00Z", false)));

        List<String> ids = users.unconfirmedCreatedBefore(CUTOFF);

        assertEquals(101, ids.size());
        assertEquals("u-last", ids.getLast());
        server.verify();
    }

    @Test
    void stopsAtTheFirstUserCreatedAfterTheCutoff() {
        ZitadelUsers users = users("https://zitadel.test");
        server.expect(requestTo("https://zitadel.test/v2/users"))
                .andRespond(page(500, user("u1", "2026-09-30T00:00:00Z", false),
                        user("u2", "2026-10-01T00:00:00Z", false),
                        user("u3", "2026-10-02T00:00:00Z", false)));

        assertEquals(List.of("u1"), users.unconfirmedCreatedBefore(CUTOFF));
        server.verify();
    }

    @Test
    void skipsUsersWithoutAnEmail() {
        ZitadelUsers users = users("https://zitadel.test");
        server.expect(requestTo("https://zitadel.test/v2/users"))
                .andRespond(page(3, user("u1", "2026-09-01T00:00:00Z", null),
                        "{\"userId\": \"machine\", \"details\": {\"creationDate\": \"2026-09-01T00:00:00Z\"}}",
                        user("u2", "2026-09-01T00:00:00Z", false)));

        assertEquals(List.of("u2"), users.unconfirmedCreatedBefore(CUTOFF));
    }

    @Test
    void theIssuerMayEndWithASlash() {
        ZitadelUsers users = users("https://zitadel.test/");
        server.expect(requestTo("https://zitadel.test/v2/users")).andRespond(page(0));

        assertEquals(List.of(), users.unconfirmedCreatedBefore(CUTOFF));
        server.verify();
    }

    @Test
    void anEmptyAnswerListsNobody() {
        // Protobuf JSON leaves out a total of 0.
        ZitadelUsers users = users("https://zitadel.test");
        server.expect(requestTo("https://zitadel.test/v2/users"))
                .andRespond(withSuccess("{\"details\": {\"timestamp\": \"2026-10-01T00:00:00Z\"}}",
                        MediaType.APPLICATION_JSON));

        assertEquals(List.of(), users.unconfirmedCreatedBefore(CUTOFF));
    }

    @Test
    void deleteSendsTheUserId() {
        ZitadelUsers users = users("https://zitadel.test");
        server.expect(requestTo("https://zitadel.test/v2/users/u1"))
                .andExpect(method(HttpMethod.DELETE))
                .andExpect(header("Authorization", "Bearer api-token"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        users.delete("u1");
        server.verify();
    }

    @Test
    void deletingAMissingUserIsNotAnError() {
        ZitadelUsers users = users("https://zitadel.test");
        server.expect(requestTo("https://zitadel.test/v2/users/u1")).andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertDoesNotThrow(() -> users.delete("u1"));
    }

    @Test
    void anErrorNeverShowsTheToken() {
        ZitadelUsers users = users("https://zitadel.test");
        server.expect(requestTo("https://zitadel.test/v2/users")).andRespond(withStatus(HttpStatus.UNAUTHORIZED)
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"message\": \"token api-token invalid for jane@example.com\"}"));
        server.expect(requestTo("https://zitadel.test/v2/users/u1"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR).body("jane@example.com"));

        ZitadelApiException listing = assertThrows(ZitadelApiException.class,
                () -> users.unconfirmedCreatedBefore(CUTOFF));
        ZitadelApiException deleting = assertThrows(ZitadelApiException.class, () -> users.delete("u1"));

        assertEquals("Zitadel answered 401 to POST /v2/users", listing.getMessage());
        assertEquals("Zitadel answered 500 to DELETE /v2/users/u1", deleting.getMessage());
        for (ZitadelApiException exception : List.of(listing, deleting)) {
            assertFalse(exception.getMessage().contains("api-token"));
            assertFalse(exception.getMessage().contains("jane"));
        }
    }

    @Test
    void holdsARoleWhenTheUserIsAMember() {
        ZitadelUsers users = users("https://zitadel.test");
        server.expect(requestTo("https://zitadel.test/management/v1/users/admin/memberships/_search"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer api-token"))
                .andExpect(jsonPath("$.query.limit").value(1))
                .andRespond(withSuccess("{\"details\": {\"totalResult\": \"1\"}, \"result\": [{\"userId\": \"admin\","
                        + " \"roles\": [\"IAM_OWNER\"]}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://zitadel.test/management/v1/users/player/memberships/_search"))
                .andRespond(withSuccess("{\"details\": {}}", MediaType.APPLICATION_JSON));

        assertTrue(users.holdsARole("admin"));
        assertFalse(users.holdsARole("player"));
        server.verify();
    }

    @Test
    void aFailedRoleCheckIsAnError() {
        ZitadelUsers users = users("https://zitadel.test");
        server.expect(requestTo("https://zitadel.test/management/v1/users/u1/memberships/_search"))
                .andRespond(withStatus(HttpStatus.FORBIDDEN).body("jane@example.com"));

        ZitadelApiException exception = assertThrows(ZitadelApiException.class, () -> users.holdsARole("u1"));

        assertEquals("Zitadel answered 403 to POST /management/v1/users/u1/memberships/_search",
                exception.getMessage());
    }

    @Test
    void aZitadelThatNeverAnswersTimesOut() throws IOException {
        HttpServer silent = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        silent.createContext("/", exchange -> {
            try {
                Thread.sleep(10_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            exchange.close();
        });
        silent.start();
        try {
            ZitadelUsers users = new ZitadelUsers(
                    new ZitadelProperties("http://127.0.0.1:" + silent.getAddress().getPort(), "", "", "api-token"),
                    RestClient.builder().requestFactory(
                            ZitadelUsers.requestFactory(Duration.ofSeconds(1), Duration.ofMillis(200))));

            assertTimeoutPreemptively(Duration.ofSeconds(3),
                    () -> assertThrows(ZitadelApiException.class, () -> users.unconfirmedCreatedBefore(CUTOFF)));
        } finally {
            silent.stop(0);
        }
    }

    private static String user(String id, String creationDate, Boolean verified) {
        String email = verified == null ? "" : ", \"email\": {\"email\": \"" + id + "@example.com\", \"isVerified\": "
                + verified + "}";
        return "{\"userId\": \"" + id + "\", \"details\": {\"creationDate\": \"" + creationDate + "\"},"
                + " \"human\": {\"profile\": {\"givenName\": \"Jane\"}" + email + "}}";
    }

    private static org.springframework.test.web.client.ResponseCreator page(long total, String... users) {
        List<String> all = new ArrayList<>(List.of(users));
        return withSuccess("{\"details\": {\"totalResult\": \"" + total + "\"}, \"result\": ["
                + all.stream().collect(Collectors.joining(", ")) + "]}", MediaType.APPLICATION_JSON);
    }
}
