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

/** Where Beelot runs without the privacy environment variables, the policy says the values are not configured. */
@WebMvcTest(PrivacyController.class)
@Import(WebSliceTestConfiguration.class)
class UnsetPolicyInfoTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AccountDeletionService deletion;

    @Test
    void unsetValuesAreNull() throws Exception {
        mockMvc.perform(get("/api/privacy/policy-info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.controller").doesNotHaveJsonPath())
                .andExpect(jsonPath("$.contact").doesNotHaveJsonPath())
                .andExpect(jsonPath("$.hostingProvider").doesNotHaveJsonPath())
                .andExpect(jsonPath("$.smtpProvider").doesNotHaveJsonPath())
                .andExpect(jsonPath("$.backupRetentionDays").doesNotHaveJsonPath());
    }
}
