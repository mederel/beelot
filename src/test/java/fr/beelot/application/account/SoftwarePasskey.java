package fr.beelot.application.account;

import com.webauthn4j.data.AttestationConveyancePreference;
import com.webauthn4j.data.AuthenticatorAssertionResponse;
import com.webauthn4j.data.AuthenticatorAttestationResponse;
import com.webauthn4j.data.AuthenticatorSelectionCriteria;
import com.webauthn4j.data.PublicKeyCredential;
import com.webauthn4j.data.PublicKeyCredentialCreationOptions;
import com.webauthn4j.data.PublicKeyCredentialParameters;
import com.webauthn4j.data.PublicKeyCredentialRequestOptions;
import com.webauthn4j.data.PublicKeyCredentialRpEntity;
import com.webauthn4j.data.PublicKeyCredentialType;
import com.webauthn4j.data.PublicKeyCredentialUserEntity;
import com.webauthn4j.data.ResidentKeyRequirement;
import com.webauthn4j.data.UserVerificationRequirement;
import com.webauthn4j.data.attestation.statement.COSEAlgorithmIdentifier;
import com.webauthn4j.data.client.Origin;
import com.webauthn4j.data.client.challenge.DefaultChallenge;
import com.webauthn4j.test.authenticator.webauthn.PackedAuthenticator;
import com.webauthn4j.test.authenticator.webauthn.WebAuthnAuthenticatorAdaptor;
import com.webauthn4j.test.client.ClientPlatform;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A passkey held in software, as a browser and its authenticator would hold it: it reads the options Beelot sends
 * and answers in the JSON format of Spring Security's own client script, base64url-encoded. One instance holds the
 * one key it registers, so a test can sign in with it again and again.
 */
public final class SoftwarePasskey {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Base64.Encoder BASE64URL = Base64.getUrlEncoder().withoutPadding();

    private final ClientPlatform platform;

    /** A passkey in a browser at Beelot's test origin. */
    public SoftwarePasskey() {
        this("http://localhost");
    }

    /** A passkey in a browser at the given origin. */
    public SoftwarePasskey(String origin) {
        this.platform = new ClientPlatform(new Origin(origin),
                new WebAuthnAuthenticatorAdaptor(new PackedAuthenticator()));
    }

    /** Creates the key for the creation options, and returns the body to post to {@code /api/sign-up}. */
    public String register(String creationOptionsJson) {
        JsonNode options = JSON.readTree(creationOptionsJson);
        JsonNode rp = options.get("rp");
        JsonNode user = options.get("user");
        JsonNode selection = options.get("authenticatorSelection");
        List<PublicKeyCredentialParameters> parameters = new ArrayList<>();
        for (JsonNode parameter : options.get("pubKeyCredParams")) {
            parameters.add(new PublicKeyCredentialParameters(
                    PublicKeyCredentialType.create(parameter.get("type").asString()),
                    COSEAlgorithmIdentifier.create(parameter.get("alg").asLong())));
        }
        PublicKeyCredential<AuthenticatorAttestationResponse, ?> credential = platform.create(
                new PublicKeyCredentialCreationOptions(
                        new PublicKeyCredentialRpEntity(rp.get("id").asString(), rp.get("name").asString()),
                        new PublicKeyCredentialUserEntity(decode(user.get("id")), user.get("name").asString(),
                                user.get("displayName").asString()),
                        new DefaultChallenge(decode(options.get("challenge"))),
                        parameters, null, List.of(),
                        new AuthenticatorSelectionCriteria(null,
                                ResidentKeyRequirement.create(selection.get("residentKey").asString()),
                                UserVerificationRequirement.create(selection.get("userVerification").asString())),
                        AttestationConveyancePreference.create(options.get("attestation").asString()), null));
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("attestationObject", encode(credential.getResponse().getAttestationObject()));
        response.put("clientDataJSON", encode(credential.getResponse().getClientDataJSON()));
        response.put("transports", List.of("internal"));
        Map<String, Object> publicKey = new LinkedHashMap<>();
        publicKey.put("id", encode(credential.getRawId()));
        publicKey.put("rawId", encode(credential.getRawId()));
        publicKey.put("response", response);
        publicKey.put("type", "public-key");
        publicKey.put("clientExtensionResults", Map.of("credProps", Map.of("rk", true)));
        publicKey.put("authenticatorAttachment", "platform");
        return JSON.writeValueAsString(Map.of("credential", publicKey, "label", "Beelot"));
    }

    /** Signs the request options with the key, and returns the body to post to {@code /login/webauthn}. */
    public String signIn(String requestOptionsJson) {
        JsonNode options = JSON.readTree(requestOptionsJson);
        PublicKeyCredential<AuthenticatorAssertionResponse, ?> credential = platform.get(
                new PublicKeyCredentialRequestOptions(new DefaultChallenge(decode(options.get("challenge"))), null,
                        options.get("rpId").asString(), List.of(),
                        UserVerificationRequirement.create(options.get("userVerification").asString()), null));
        AuthenticatorAssertionResponse assertion = credential.getResponse();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("authenticatorData", encode(assertion.getAuthenticatorData()));
        response.put("clientDataJSON", encode(assertion.getClientDataJSON()));
        response.put("signature", encode(assertion.getSignature()));
        response.put("userHandle", encode(assertion.getUserHandle()));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", encode(credential.getRawId()));
        body.put("rawId", encode(credential.getRawId()));
        body.put("response", response);
        body.put("credType", "public-key");
        body.put("clientExtensionResults", Map.of());
        body.put("authenticatorAttachment", "platform");
        return JSON.writeValueAsString(body);
    }

    private static byte[] decode(JsonNode base64url) {
        return Base64.getUrlDecoder().decode(base64url.asString());
    }

    private static String encode(byte[] bytes) {
        return BASE64URL.encodeToString(bytes);
    }
}
