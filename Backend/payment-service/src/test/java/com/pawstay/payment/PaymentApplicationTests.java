package com.pawstay.payment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.pawstay.payment.entity.PaymentAttempt;
import com.pawstay.payment.entity.PaymentOutboxEvent;
import com.pawstay.payment.repository.PaymentAttemptRepository;
import com.pawstay.payment.repository.PaymentOutboxRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "payment.outbox.enabled=false")
@EnabledIfEnvironmentVariable(named = "PAYMENT_MYSQL_TEST", matches = "true")
@Transactional
class PaymentApplicationTests {
    private static final String BOOKING = "000000000000000000000001";
    private static final String OWNER = "000000000000000000000002";
    private static final String OTHER_OWNER = "000000000000000000000003";

    @LocalServerPort
    private int port;

    private final PaymentAttemptRepository attempts;
    private final PaymentOutboxRepository outbox;

    @Autowired
    PaymentApplicationTests(PaymentAttemptRepository attempts, PaymentOutboxRepository outbox) {
        this.attempts = attempts;
        this.outbox = outbox;
    }

    @Test
    void persistsAttemptAndOutboxAndScopesLookupsToOwner() {
        String reference = UUID.randomUUID().toString();
        PaymentAttempt attempt = attempts.saveAndFlush(attempt("checkout", reference));
        assertEquals(attempt.getId(), attempts.findByVnpTxnRef(reference).orElseThrow().getId());
        assertEquals(attempt.getId(), attempts.findByOwnerIdAndIdempotencyKey(OWNER, "checkout").orElseThrow().getId());
        assertTrue(attempts.findByIdAndOwnerId(attempt.getId(), OTHER_OWNER).isEmpty());

        Instant now = Instant.now();
        String eventId = UUID.randomUUID().toString();
        String payload = "{\"event_id\":\"" + eventId + "\"}";
        outbox.saveAndFlush(new PaymentOutboxEvent(eventId, attempt.getId(), payload, now));
        assertTrue(outbox.existsById(eventId));
    }

    @Test
    void rejectsDuplicateIdempotencyKeyForSameOwner() {
        attempts.saveAndFlush(attempt("retry", UUID.randomUUID().toString()));
        assertThrows(DataIntegrityViolationException.class,
                () -> attempts.saveAndFlush(attempt("retry", UUID.randomUUID().toString())));
    }

    @Test
    void rejectsDuplicateVnpayReference() {
        String reference = UUID.randomUUID().toString();
        attempts.saveAndFlush(attempt("first", reference));
        assertThrows(DataIntegrityViolationException.class,
                () -> attempts.saveAndFlush(attempt("second", reference)));
    }

    @Test
    void rejectsUnauthenticatedRequestsAndClientSuppliedAmounts() throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            var url = URI.create("http://localhost:" + port + "/api/payments");
            var unauthorized = HttpRequest.newBuilder(url.resolve("/api/payments/00000000-0000-0000-0000-000000000001")).build();
            assertEquals(401, http.send(unauthorized, HttpResponse.BodyHandlers.discarding()).statusCode());
            var invalid = HttpRequest.newBuilder(url).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString("{\"booking_id\":\"" + BOOKING + "\",\"amount\":1}")).build();
            assertEquals(400, http.send(invalid, HttpResponse.BodyHandlers.discarding()).statusCode());
        }
    }

    private PaymentAttempt attempt(String key, String reference) {
        Instant now = Instant.now();
        return new PaymentAttempt(UUID.randomUUID().toString(), BOOKING, OWNER, key, reference,
                150_000L, "VND", now.plusSeconds(900), now, null);
    }
}
