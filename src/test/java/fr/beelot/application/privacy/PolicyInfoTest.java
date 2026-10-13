package fr.beelot.application.privacy;

import fr.beelot.application.WebSliceTestConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = PrivacyController.class, properties = {
        "beelot.privacy.controller=Beelot SAS",
        "beelot.privacy.contact=privacy@example.com",
        "beelot.privacy.hosting-provider=Hetzner",
        "beelot.privacy.smtp-provider=Brevo",
        "beelot.privacy.backup-retention-days=30"})
@Import(WebSliceTestConfiguration.class)
class PolicyInfoTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AccountDeletionService deletion;

    @Test
    void policyInfoComesFromTheEnvironment() throws Exception {
        mockMvc.perform(get("/api/privacy/policy-info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.controller").value("Beelot SAS"))
                .andExpect(jsonPath("$.contact").value("privacy@example.com"))
                .andExpect(jsonPath("$.hostingProvider").value("Hetzner"))
                .andExpect(jsonPath("$.smtpProvider").value("Brevo"))
                .andExpect(jsonPath("$.backupRetentionDays").value("30"));
    }
}
