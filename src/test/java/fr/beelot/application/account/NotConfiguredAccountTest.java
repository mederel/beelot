package fr.beelot.application.account;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mariadb.MariaDBContainer;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Without Zitadel configured, nobody is offered to sign in. */
@SpringBootTest(properties = {
        "beelot.zitadel.issuer=",
        "beelot.zitadel.client-id=",
        "beelot.zitadel.client-secret="})
@AutoConfigureMockMvc
@Testcontainers
class NotConfiguredAccountTest {

    @Container
    @ServiceConnection
    static final MariaDBContainer MARIADB = new MariaDBContainer("mariadb:11.4");

    @Autowired
    private MockMvc mockMvc;

    @Test
    void aGuestIsNotOfferedToSignIn() throws Exception {
        mockMvc.perform(get("/api/account"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signedIn").value(false))
                .andExpect(jsonPath("$.signInUrl").doesNotExist())
                .andExpect(jsonPath("$.registerUrl").doesNotExist());
    }
}
