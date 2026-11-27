package com.pawstay.payment.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.pawstay.payment.exception.PaymentException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.time.Clock;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
public class AuthClient {
    private final RestClient http;
    private final String baseUrl;
    private final String publicKeyPath;
    private final String issuer;
    private final Clock clock;
    private NimbusJwtDecoder decoder;

    public AuthClient(RestClient http, @Value("${auth.service.base-url}") String baseUrl,
                      @Value("${jwt.public-key-path}") String publicKeyPath,
                      @Value("${jwt.issuer}") String issuer, Clock clock) {
        this.http = http;
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.publicKeyPath = publicKeyPath;
        this.issuer = issuer;
        this.clock = clock;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record User(String id, String role) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Data(User user) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Response(boolean success, Data data) {}

    public String requireCustomer(String authorization) {
        return requireRole(authorization, "USER", "Customer role required");
    }

    public String requireStaff(String authorization) {
        return requireRole(authorization, "STAFF", "Staff role required");
    }

    private String requireRole(String authorization, String role, String message) {
        if (authorization == null || !authorization.matches("(?i)Bearer [^\\s]+")) {
            throw unauthorized();
        }
        Jwt jwt;
        try {
            jwt = decoder().decode(authorization.substring(7));
        } catch (JwtException exception) {
            throw unauthorized();
        }
        if (jwt.getSubject() == null || !jwt.getSubject().matches("[a-f0-9]{24}")
                || jwt.getIssuedAt() == null || jwt.getIssuedAt().isAfter(clock.instant())
                || jwt.getExpiresAt() == null || !jwt.getExpiresAt().isAfter(clock.instant())) {
            throw unauthorized();
        }
        if (baseUrl.isBlank()) {
            throw unavailable();
        }
        Response response;
        try {
            response = http.get().uri(baseUrl + "/api/auth/me")
                    .headers(headers -> headers.setBearerAuth(authorization.substring(7)))
                    .retrieve().body(Response.class);
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 401 || exception.getStatusCode().value() == 403) {
                throw unauthorized();
            }
            throw unavailable();
        } catch (RestClientException | IllegalArgumentException exception) {
            throw unavailable();
        }
        User user = response != null && response.success() && response.data() != null ? response.data().user() : null;
        if (user == null || !jwt.getSubject().equals(user.id())
                || !("USER".equals(user.role()) || "STAFF".equals(user.role()))) {
            throw unavailable();
        }
        if (!role.equals(user.role())) {
            throw new PaymentException(HttpStatus.FORBIDDEN, message);
        }
        return user.id();
    }

    private synchronized NimbusJwtDecoder decoder() {
        if (decoder == null) {
            if (publicKeyPath.isBlank() || issuer.isBlank()) {
                throw unavailable();
            }
            try {
                String pem = Files.readString(Path.of(publicKeyPath))
                        .replace("-----BEGIN PUBLIC KEY-----", "")
                        .replace("-----END PUBLIC KEY-----", "").replaceAll("\\s+", "");
                var spec = new X509EncodedKeySpec(Base64.getDecoder().decode(pem));
                var key = (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(spec);
                var configured = NimbusJwtDecoder.withPublicKey(key).build();
                configured.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer));
                decoder = configured;
            } catch (IOException | GeneralSecurityException | IllegalArgumentException exception) {
                throw unavailable();
            }
        }
        return decoder;
    }

    private PaymentException unauthorized() {
        return new PaymentException(HttpStatus.UNAUTHORIZED, "Invalid or missing access token");
    }

    private PaymentException unavailable() {
        return new PaymentException(HttpStatus.SERVICE_UNAVAILABLE, "Authentication service unavailable or not configured");
    }
}
