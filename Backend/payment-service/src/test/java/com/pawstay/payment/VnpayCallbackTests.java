package com.pawstay.payment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.pawstay.payment.entity.PaymentAttempt;
import com.pawstay.payment.repository.PaymentAttemptRepository;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "vnpay.tmn-code=TEST", "vnpay.hash-secret=callback-test-key", "payment.frontend-return-url=", "payment.outbox.enabled=false"
})
@EnabledIfEnvironmentVariable(named = "PAYMENT_MYSQL_TEST", matches = "true")
class VnpayCallbackTests {
    private static final String BOOKING = "000000000000000000000001";
    private final PaymentAttemptRepository attempts;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final String id = UUID.randomUUID().toString();
    private final String ref = id.replace("-", "");

    @LocalServerPort
    private int port;

    @Autowired
    VnpayCallbackTests(PaymentAttemptRepository attempts, JdbcTemplate jdbc, ObjectMapper json) {
        this.attempts = attempts;
        this.jdbc = jdbc;
        this.json = json;
    }

    @BeforeEach
    void insertExpiredHold() {
        Instant now = Instant.now();
        attempts.saveAndFlush(new PaymentAttempt(id, BOOKING, "000000000000000000000002",
                id, ref, 150_000L, "VND", now.minusSeconds(1), now.minusSeconds(901), null));
    }

    @AfterEach
    void removeRows() {
        jdbc.update("delete from payment_outbox where payment_id = ?", id);
        attempts.deleteById(id);
    }

    @Test
    void recordsLateSuccessExactlyOnceAcrossConcurrentCallbacksAndPreservesSuccess() throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            var request = ipn(signed(fields("00", "00")));
            var first = http.sendAsync(request, HttpResponse.BodyHandlers.ofString());
            var second = http.sendAsync(request, HttpResponse.BodyHandlers.ofString());
            assertEquals(Set.of("00", "02"), Set.of(code(first.get()), code(second.get())));
            assertEquals("02", code(http.send(ipn(signed(fields("24", "02"))), HttpResponse.BodyHandlers.ofString())));
        }
        assertEquals(PaymentAttempt.Status.SUCCEEDED, attempts.findById(id).orElseThrow().getStatus());
        assertEquals(1, events());
        var event = json.readTree(jdbc.queryForObject(
                "select payload from payment_outbox where payment_id = ?", String.class, id));
        assertTrue(event.get("event_id").asString().matches("[0-9a-f-]{36}"));
        assertEquals(id, event.get("payment_id").asString());
        assertEquals(BOOKING, event.get("booking_id").asString());
        assertEquals(150_000L, event.get("amount").asLong());
        assertEquals("VND", event.get("currency").asString());
        assertEquals("SUCCEEDED", event.get("result").asString());
    }

    @Test
    void rejectsInvalidChecksumMerchantAmountAndDuplicateFields() throws Exception {
        var good = fields("00", "00");
        var wrongAmount = new TreeMap<>(good);
        wrongAmount.put("vnp_Amount", "1");
        var wrongMerchant = new TreeMap<>(good);
        wrongMerchant.put("vnp_TmnCode", "OTHER");
        var unknownReference = new TreeMap<>(good);
        unknownReference.put("vnp_TxnRef", "unknown");
        try (var http = HttpClient.newHttpClient()) {
            assertEquals("97", code(http.send(ipn(signed(good).replace("15000000", "15000001")),
                    HttpResponse.BodyHandlers.ofString())));
            assertEquals("97", code(http.send(ipn(signed(wrongMerchant)), HttpResponse.BodyHandlers.ofString())));
            assertEquals("04", code(http.send(ipn(signed(wrongAmount)), HttpResponse.BodyHandlers.ofString())));
            assertEquals("97", code(http.send(ipn(signed(good) + "&vnp_TxnRef=other"),
                    HttpResponse.BodyHandlers.ofString())));
            assertEquals("01", code(http.send(ipn(signed(unknownReference)), HttpResponse.BodyHandlers.ofString())));
        }
        assertEquals(PaymentAttempt.Status.PENDING, attempts.findById(id).orElseThrow().getStatus());
        assertEquals(0, events());
    }

    @Test
    void leavesUnclearResultPendingAndRecordsVerifiedFailure() throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            assertEquals("99", code(http.send(ipn(signed(fields("99", "01"))), HttpResponse.BodyHandlers.ofString())));
            assertEquals(PaymentAttempt.Status.PENDING, attempts.findById(id).orElseThrow().getStatus());
            assertEquals(0, events());
            assertEquals("00", code(http.send(ipn(signed(fields("24", "02"))), HttpResponse.BodyHandlers.ofString())));
        }
        assertEquals(PaymentAttempt.Status.FAILED, attempts.findById(id).orElseThrow().getStatus());
        assertEquals(1, events());
    }

    @Test
    void returnWorksWithoutFrontendAndDoesNotChangeState() throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            var request = HttpRequest.newBuilder(URI.create(base() + "/return?" + signed(fields("00", "00")))).build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            assertEquals(200, response.statusCode());
            assertTrue(response.body().contains("authenticated Payment API"));
            assertFalse(response.body().contains(ref));
        }
        assertEquals(PaymentAttempt.Status.PENDING, attempts.findById(id).orElseThrow().getStatus());
        assertEquals(0, events());
    }

    private String code(HttpResponse<String> response) {
        assertEquals(200, response.statusCode(), response.body());
        var body = json.readTree(response.body());
        assertTrue(body.has("Message"));
        return body.get("RspCode").asString();
    }

    private int events() {
        return jdbc.queryForObject("select count(*) from payment_outbox where payment_id = ?", Integer.class, id);
    }

    private Map<String, String> fields(String responseCode, String transactionStatus) {
        return Map.of("vnp_Amount", "15000000", "vnp_ResponseCode", responseCode,
                "vnp_TmnCode", "TEST", "vnp_TransactionNo", "12345", "vnp_TransactionStatus", transactionStatus,
                "vnp_TxnRef", ref, "vnp_OrderInfo", "Payment + test");
    }

    private String signed(Map<String, String> fields) throws Exception {
        String query = new TreeMap<>(fields).entrySet().stream()
                .map(entry -> entry.getKey() + "=" + URLEncoder.encode(entry.getValue(), StandardCharsets.US_ASCII))
                .collect(Collectors.joining("&"));
        Mac mac = Mac.getInstance("HmacSHA512");
        mac.init(new SecretKeySpec("callback-test-key".getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
        return query + "&vnp_SecureHash=" + HexFormat.of().formatHex(mac.doFinal(query.getBytes(StandardCharsets.US_ASCII)));
    }

    private String base() {
        return "http://localhost:" + port + "/api/payments/vnpay";
    }

    private HttpRequest ipn(String query) {
        return HttpRequest.newBuilder(URI.create(base() + "/ipn?" + query)).build();
    }
}
