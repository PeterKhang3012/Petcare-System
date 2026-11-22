package com.pawstay.payment;

import static org.junit.jupiter.api.Assertions.*;

import com.pawstay.payment.client.BookingClient;
import com.pawstay.payment.entity.PaymentAttempt;
import com.pawstay.payment.entity.PaymentOutboxEvent;
import com.pawstay.payment.repository.PaymentAttemptRepository;
import com.pawstay.payment.repository.PaymentOutboxRepository;
import com.pawstay.payment.scheduler.PaymentOutboxWorker;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.client.RestClient;

@SpringBootTest(properties = "payment.outbox.enabled=false")
@EnabledIfEnvironmentVariable(named = "PAYMENT_MYSQL_TEST", matches = "true")
class PaymentOutboxWorkerTests {
    private static final String TOKEN = "test-only-service-token";
    private static final String BOOKING = "000000000000000000000001";
    private final PaymentAttemptRepository attempts;
    private final PaymentOutboxRepository outbox;
    private final JdbcTemplate jdbc;
    private final PlatformTransactionManager transactions;
    private final String paymentId = UUID.randomUUID().toString();
    private final String eventId = UUID.randomUUID().toString();
    private final String payload = """
            {"event_id":"%s","booking_id":"%s","payment_id":"%s","amount":150000,"currency":"VND","result":"SUCCEEDED"}
            """.formatted(eventId, BOOKING, paymentId).strip();
    private final CopyOnWriteArrayList<DeliveryRequest> requests = new CopyOnWriteArrayList<>();
    private final AtomicInteger responseStatus = new AtomicInteger(200);
    private String receipt = receipt(true, "CONFIRMED");
    private HttpServer server;

    @Autowired
    PaymentOutboxWorkerTests(PaymentAttemptRepository attempts, PaymentOutboxRepository outbox,
                             JdbcTemplate jdbc, PlatformTransactionManager transactions) {
        this.attempts = attempts;
        this.outbox = outbox;
        this.jdbc = jdbc;
        this.transactions = transactions;
    }

    @BeforeEach
    void prepare() throws Exception {
        Instant now = Instant.now().minusSeconds(1);
        var attempt = new PaymentAttempt(paymentId, BOOKING, "000000000000000000000002",
                paymentId, paymentId.replace("-", ""), 150_000, "VND", now.plusSeconds(900), now, null);
        attempt.recordGatewayResult(PaymentAttempt.Status.SUCCEEDED, "123", "00", "00", now);
        attempts.saveAndFlush(attempt);
        outbox.saveAndFlush(new PaymentOutboxEvent(eventId, paymentId, payload, now));

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/internal/bookings/payment-events", exchange -> {
            try (exchange) {
                requests.add(new DeliveryRequest(exchange.getRequestMethod(),
                        exchange.getRequestHeaders().getFirst("X-Service-Token"),
                        exchange.getRequestHeaders().getFirst("X-Correlation-ID"),
                        new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
                byte[] body = receipt.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(responseStatus.get(), body.length);
                exchange.getResponseBody().write(body);
            }
        });
        server.start();
    }

    @AfterEach
    void cleanup() {
        if (server != null) {
            server.stop(0);
        }
        outbox.deleteById(eventId);
        attempts.deleteById(paymentId);
    }

    @Test
    void retriesUnavailableBookingWithSamePayloadAndThenDelivers() {
        var worker = worker(3);
        responseStatus.set(503);
        worker.poll();
        assertState(PaymentOutboxEvent.Status.PENDING, "BOOKING_HTTP_503", 1);
        worker.poll();
        assertEquals(1, requests.size(), "backoff must prevent immediate resends");

        makeDue();
        responseStatus.set(200);
        worker.poll();
        assertState(PaymentOutboxEvent.Status.DELIVERED, "CONFIRMED", 2);
        assertEquals(2, requests.size());
        assertEquals(new DeliveryRequest("POST", TOKEN, eventId, payload), requests.getFirst());
        assertEquals(requests.getFirst(), requests.getLast());
    }

    @Test
    void preservesSuccessfulPaymentWhenBookingRejectsExpiredHold() {
        receipt = receipt(false, "BOOKING_EXPIRED");
        worker(3).poll();
        assertState(PaymentOutboxEvent.Status.REJECTED, "BOOKING_EXPIRED", 1);
        assertEquals(PaymentAttempt.Status.SUCCEEDED, attempts.findById(paymentId).orElseThrow().getStatus());
    }

    @Test
    void deadLettersPermanentErrorsAndStopsResending() {
        responseStatus.set(409);
        var worker = worker(3);
        worker.poll();
        worker.poll();
        assertState(PaymentOutboxEvent.Status.DEAD_LETTER, "BOOKING_HTTP_409", 1);
        assertEquals(1, requests.size());
    }

    @Test
    void stopsAtRetryLimit() {
        responseStatus.set(503);
        worker(1).poll();
        assertState(PaymentOutboxEvent.Status.DEAD_LETTER, "BOOKING_HTTP_503", 1);
    }

    @Test
    void concurrentWorkersSendOneRequest() throws Exception {
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = executor.submit(worker(3)::poll);
            var second = executor.submit(worker(3)::poll);
            first.get(10, java.util.concurrent.TimeUnit.SECONDS);
            second.get(10, java.util.concurrent.TimeUnit.SECONDS);
        }
        assertState(PaymentOutboxEvent.Status.DELIVERED, "CONFIRMED", 1);
        assertEquals(1, requests.size());
    }

    private PaymentOutboxWorker worker(int maxAttempts) {
        var booking = new BookingClient(RestClient.create(), "http://127.0.0.1:" + server.getAddress().getPort(), TOKEN);
        return new PaymentOutboxWorker(outbox, booking, transactions, Clock.systemUTC(), 1, maxAttempts, 30_000);
    }

    private void makeDue() {
        jdbc.update("update payment_outbox set next_attempt_at = UTC_TIMESTAMP(6) where event_id = ?", eventId);
    }

    private void assertState(PaymentOutboxEvent.Status status, String outcome, int sent) {
        var row = outbox.findById(eventId).orElseThrow();
        assertEquals(status, row.getStatus());
        assertEquals(outcome, row.getBookingOutcome());
        assertEquals(sent, row.getAttempts());
    }

    private String receipt(boolean accepted, String outcome) {
        return """
                {"success":true,"data":{"accepted":%s,"outcome":"%s","retryable":false}}
                """.formatted(accepted, outcome);
    }

    private record DeliveryRequest(String method, String token, String correlationId, String body) {}
}
