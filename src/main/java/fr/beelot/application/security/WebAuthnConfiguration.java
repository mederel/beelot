package fr.beelot.application.security;

import fr.beelot.application.account.RelyingParty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.security.web.webauthn.api.AuthenticatorSelectionCriteria;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialRpEntity;
import org.springframework.security.web.webauthn.api.ResidentKeyRequirement;
import org.springframework.security.web.webauthn.api.UserVerificationRequirement;
import org.springframework.security.web.webauthn.jackson.WebauthnJacksonModule;
import org.springframework.security.web.webauthn.management.JdbcPublicKeyCredentialUserEntityRepository;
import org.springframework.security.web.webauthn.management.JdbcUserCredentialRepository;
import org.springframework.security.web.webauthn.management.PublicKeyCredentialUserEntityRepository;
import org.springframework.security.web.webauthn.management.UserCredentialRepository;
import org.springframework.security.web.webauthn.management.WebAuthnRelyingPartyOperations;
import org.springframework.security.web.webauthn.management.Webauthn4JRelyingPartyOperations;
import tools.jackson.databind.json.JsonMapper;

import java.util.Set;

/**
 * Passkeys (US-084): Beelot is the relying party at {@code BEELOT_PUBLIC_URL}, and Spring Security keeps the WebAuthn
 * users and their credentials in the database. Every passkey is discoverable and verifies the player, so that signing
 * in needs no user name.
 */
@Configuration
public class WebAuthnConfiguration {

    @Bean
    RelyingParty relyingParty(@Value("${beelot.public-url}") String publicUrl) {
        return RelyingParty.of(publicUrl);
    }

    @Bean
    PublicKeyCredentialUserEntityRepository userEntityRepository(JdbcOperations jdbc) {
        return new JdbcPublicKeyCredentialUserEntityRepository(jdbc);
    }

    @Bean
    UserCredentialRepository userCredentialRepository(JdbcOperations jdbc) {
        return new JdbcUserCredentialRepository(jdbc);
    }

    @Bean
    WebAuthnRelyingPartyOperations relyingPartyOperations(PublicKeyCredentialUserEntityRepository userEntities,
                                                          UserCredentialRepository credentials,
                                                          RelyingParty relyingParty) {
        Webauthn4JRelyingPartyOperations operations = new Webauthn4JRelyingPartyOperations(userEntities, credentials,
                PublicKeyCredentialRpEntity.builder().name("Beelot").id(relyingParty.id()).build(),
                Set.of(relyingParty.origin()));
        operations.setCustomizeCreationOptions(options -> options.authenticatorSelection(
                AuthenticatorSelectionCriteria.builder()
                        .residentKey(ResidentKeyRequirement.REQUIRED)
                        .userVerification(UserVerificationRequirement.REQUIRED)
                        .build()));
        return operations;
    }

    /**
     * Reads and writes WebAuthn options and credentials in the JSON of Spring Security's client script. Not a default
     * candidate, so that it does not replace the application's own JSON mapper.
     */
    @Bean(name = "webAuthnJson", defaultCandidate = false)
    JsonMapper webAuthnJson() {
        return JsonMapper.builder().addModule(new WebauthnJacksonModule()).build();
    }
}
