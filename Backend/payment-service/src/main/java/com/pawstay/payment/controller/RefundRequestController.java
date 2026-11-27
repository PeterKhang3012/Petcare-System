package com.pawstay.payment.controller;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.pawstay.payment.client.AuthClient;
import com.pawstay.payment.client.VnpayClient;
import com.pawstay.payment.service.VnpayIpnService;
import java.time.Clock;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.bind.annotation.PathVariable;
import com.pawstay.payment.entity.PaymentAttempt;
import com.pawstay.payment.exception.PaymentException;
import com.pawstay.payment.repository.PaymentAttemptRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class RefundRequestController {
    private static final String UUID = "[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}";
    private final AuthClient auth;
    private final PaymentAttemptRepository attempts;
    private final JdbcClient database;
    private final String internalToken;
    private final VnpayClient vnpay;
    private final RestClient http;
    private final VnpayIpnService results;
    private final Clock clock;
    private final String serverIp;

    public RefundRequestController(AuthClient auth, PaymentAttemptRepository attempts, JdbcClient database,
                                   @Value("${booking.refund.internal-token:}") String internalToken,
                                   VnpayClient vnpay, RestClient http, Clock clock, VnpayIpnService results,
                                   @Value("${vnpay.refund.server-ip:}") String serverIp) {
        this.auth = auth;
        this.attempts = attempts;
        this.database = database;
        this.internalToken = internalToken;
        this.vnpay = vnpay;
        this.http = http;
        this.results = results;
        this.clock = clock;
        this.serverIp = serverIp;
    }

    private record RefundToConfirm(String paymentId, String status) {}

    record Request(
            @JsonProperty("event_id") @NotNull @Pattern(regexp = UUID) String eventId,
            @JsonProperty("payment_id") @NotNull @Pattern(regexp = UUID) String paymentId,
            @JsonProperty("booking_id") @NotNull @Pattern(regexp = "[a-f0-9]{24}") String bookingId,
            @NotNull @Positive Long amount,
            @NotNull @Pattern(regexp = "VND") String currency,
            @NotBlank @Size(max = 500) String reason) {}

    @Transactional
    @PostMapping("/internal/payment/refund-requests")
    public Map<String, Object> receive(
            @RequestHeader(value = "X-Service-Token", required = false) String token,
            @Valid @RequestBody Request request) {
        if (internalToken.length() < 32 || token == null || !MessageDigest.isEqual(
                internalToken.getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8))) {
            throw new PaymentException(HttpStatus.FORBIDDEN, "Invalid service credential");
        }
        var payment = attempts.findById(request.paymentId())
                .orElseThrow(() -> new PaymentException(HttpStatus.NOT_FOUND, "Original payment not found"));
        if (payment.getStatus() != PaymentAttempt.Status.SUCCEEDED
                || !payment.getBookingId().equals(request.bookingId())
                || payment.getAmount() != request.amount() || !payment.getCurrency().equals(request.currency())) {
            throw new PaymentException(HttpStatus.CONFLICT, "Refund does not match a successful payment");
        }
        database.sql("""
                INSERT INTO refund_requests (event_id, payment_id, booking_id, amount, currency, reason, status, created_at)
                VALUES (:event, :payment, :booking, :amount, :currency, :reason, 'REQUESTED', UTC_TIMESTAMP(6))
                ON DUPLICATE KEY UPDATE event_id = event_id
                """)
                .param("event", request.eventId()).param("payment", request.paymentId())
                .param("booking", request.bookingId()).param("amount", payment.getAmount())
                .param("currency", payment.getCurrency()).param("reason", request.reason()).update();

        boolean sameRequest = database.sql("""
                SELECT COUNT(*) FROM refund_requests
                WHERE event_id = :event AND payment_id = :payment AND BINARY reason = BINARY :reason
                """).param("event", request.eventId()).param("payment", request.paymentId())
                .param("reason", request.reason()).query(Integer.class).single() == 1;
        if (!sameRequest) {
            throw new PaymentException(HttpStatus.CONFLICT, "A different refund request already exists");
        }
        return Map.of("success", true, "data", Map.of("event_id", request.eventId()));
    }

    @PostMapping("/api/payments/staff/refund-requests/{eventId}/confirm")
    public Map<String, Object> confirm(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable String eventId) {
        String staffId = auth.requireStaff(authorization);
        if (!eventId.matches(UUID)) throw new PaymentException(HttpStatus.BAD_REQUEST, "Invalid refund ID");
        var refund = database.sql("SELECT payment_id, status FROM refund_requests WHERE event_id = :id")
                .param("id", eventId)
                .query((row, index) -> new RefundToConfirm(row.getString("payment_id"), row.getString("status"))).optional()
                .orElseThrow(() -> new PaymentException(HttpStatus.NOT_FOUND, "Refund not found"));
        if (!"REQUESTED".equals(refund.status())) {
            throw new PaymentException(HttpStatus.CONFLICT, "Refund has already been confirmed");
        }
        var payment = attempts.findById(refund.paymentId())
                .filter(attempt -> attempt.getStatus() == PaymentAttempt.Status.SUCCEEDED)
                .orElseThrow(() -> new PaymentException(HttpStatus.CONFLICT, "Original payment is not successful"));
        var request = vnpay.refundRequest(payment, eventId.replace("-", ""), staffId, serverIp, clock.instant());
        int changed = database.sql("""
                UPDATE refund_requests
                SET status = 'PROCESSING', confirmed_at = UTC_TIMESTAMP(6), confirmed_by = :staff, gateway_check = 'AWAITING_RESPONSE'
                WHERE event_id = :id AND status = 'REQUESTED'
                """).param("id", eventId).param("staff", staffId).update();
        if (changed == 0) throw new PaymentException(HttpStatus.CONFLICT, "Refund has already been confirmed");

        Map<String, String> response;
        try {
            response = vnpay.sendRefund(http, request);
        } catch (RestClientException | IllegalArgumentException exception) {
            database.sql("UPDATE refund_requests SET gateway_check = 'UNVERIFIED' WHERE event_id = :id")
                    .param("id", eventId).update();
            return Map.of("status", "PROCESSING");
        }
        String code = response.get("vnp_ResponseCode");
        String gatewayState = response.get("vnp_TransactionStatus");
        String number = response.get("vnp_TransactionNo");
        if (code == null || !code.matches("[0-9]{2}") || gatewayState == null || !gatewayState.matches("[0-9]{2}")
                || number == null || !number.matches("[0-9]{1,15}")) {
            database.sql("UPDATE refund_requests SET gateway_check = 'UNVERIFIED' WHERE event_id = :id")
                    .param("id", eventId).update();
            return Map.of("status", "PROCESSING");
        }
        String state = "PROCESSING";
        if ("95".equals(code) || ("00".equals(code) && "09".equals(gatewayState))) {
            state = "REJECTED";
        } else if ("00".equals(code) && "00".equals(gatewayState) && !number.matches("0+")
                && java.util.Objects.toString(response.get("vnp_PayDate"), "").matches("[0-9]{14}")) {
            state = "COMPLETED";
        }
        database.sql("""
                UPDATE refund_requests
                SET status = :state, gateway_response_code = :code, gateway_status = :gatewayState,
                    gateway_transaction_no = :number, gateway_check = 'VERIFIED'
                WHERE event_id = :id
                """).param("state", state).param("code", code).param("gatewayState", gatewayState)
                .param("number", number).param("id", eventId).update();
        return Map.of("status", state);
    }

    @GetMapping("/api/payments/staff/transactions")
    public Map<String, Object> transactions(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "false") boolean exceptions) {
        auth.requireStaff(authorization);
        if (page < 1) throw new PaymentException(HttpStatus.BAD_REQUEST, "Invalid page number");
        int limit = 20;
        String source = """
                FROM payment_attempts p
                LEFT JOIN payment_reconciliations r ON r.request_id = (
                    SELECT request_id FROM payment_reconciliations WHERE payment_id = p.payment_id
                    ORDER BY requested_at DESC, request_id DESC LIMIT 1
                )
                LEFT JOIN payment_outbox o ON o.event_id = (
                    SELECT event_id FROM payment_outbox WHERE payment_id = p.payment_id
                    ORDER BY created_at DESC, event_id DESC LIMIT 1
                )
                """;
        if (exceptions) source += """
                WHERE (p.status = 'PENDING' AND p.booking_expires_at <= UTC_TIMESTAMP(6))
                   OR o.status IN ('REJECTED', 'DEAD_LETTER')
                   OR (p.status = 'SUCCEEDED' AND o.status = 'DELIVERED'
                       AND o.booking_outcome NOT IN ('CONFIRMED', 'ALREADY_ACCEPTED'))
                """;
        var items = database.sql("""
                SELECT p.payment_id, p.booking_id, p.amount, p.currency, p.status, p.created_at,
                       o.status AS sync_status, o.booking_outcome,
                       r.result AS reconciliation_result, r.response_code, r.transaction_status, r.requested_at
                """ + source + " ORDER BY p.created_at DESC, p.payment_id DESC LIMIT :limit OFFSET :offset")
                .param("limit", limit).param("offset", (page - 1L) * limit).query().listOfRows();
        long total = database.sql("SELECT COUNT(*) " + source).query(Long.class).single();
        return Map.of("transactions", items, "page", page, "limit", limit, "total", total);
    }

    @PostMapping("/api/payments/staff/transactions/{paymentId}/reconcile")
    public Map<String, String> reconcile(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable String paymentId) {
        String staff = auth.requireStaff(authorization);
        if (!paymentId.matches(UUID)) throw new PaymentException(HttpStatus.BAD_REQUEST, "Invalid payment ID");
        var payment = attempts.findById(paymentId)
                .orElseThrow(() -> new PaymentException(HttpStatus.NOT_FOUND, "Payment not found"));
        if (serverIp.isBlank()) throw new PaymentException(HttpStatus.SERVICE_UNAVAILABLE, "VNPAY server IP is not configured");
        String request = java.util.UUID.randomUUID().toString().replace("-", "");
        database.sql("""
                INSERT INTO payment_reconciliations (request_id, payment_id, requested_by, requested_at, result)
                VALUES (:request, :payment, :staff, UTC_TIMESTAMP(6), 'REQUESTED')
                """).param("request", request).param("payment", paymentId).param("staff", staff).update();
        String result;
        String code = "";
        String state = "";
        try {
            var response = vnpay.queryPayment(http, payment, request, serverIp, clock.instant());
            code = java.util.Objects.toString(response.get("vnp_ResponseCode"), "");
            state = java.util.Objects.toString(response.get("vnp_TransactionStatus"), "");
            result = code.matches("[0-9]{2}") && state.matches("[0-9]{2}")
                    && (!"00".equals(code) || ("01".equals(response.get("vnp_TransactionType"))
                        && Long.toString(Math.multiplyExact(payment.getAmount(), 100L)).equals(response.get("vnp_Amount"))))
                    ? "VERIFIED" : "UNVERIFIED";
            String number = response.get("vnp_TransactionNo");
            if ("VERIFIED".equals(result) && "00".equals(code) && "00".equals(state)
                    && number != null && number.matches("[0-9]{1,15}") && !number.matches("0+")) {
                results.applyVerifiedQuerySuccess(payment.getVnpTxnRef(), response.get("vnp_Amount"), number);
            }
        } catch (RestClientException | IllegalArgumentException exception) {
            result = "UNVERIFIED";
        }
        database.sql("""
                UPDATE payment_reconciliations SET result = :result,
                    response_code = NULLIF(:code, ''), transaction_status = NULLIF(:state, '')
                WHERE request_id = :request
                """).param("result", result).param("code", "VERIFIED".equals(result) ? code : "")
                .param("state", "VERIFIED".equals(result) ? state : "").param("request", request).update();
        return Map.of("result", result);
    }

    @GetMapping("/api/payments/staff/refund-requests")
    public Map<String, Object> list(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestParam(defaultValue = "1") int page) {
        auth.requireStaff(authorization);
        if (page < 1) throw new PaymentException(HttpStatus.BAD_REQUEST, "Invalid page number");
        int limit = 20;
        List<Map<String, Object>> items = database.sql("""
                SELECT event_id, payment_id, booking_id, amount, currency, reason, status, created_at,
                       confirmed_at, confirmed_by, gateway_response_code, gateway_status, gateway_transaction_no, gateway_check
                FROM refund_requests
                ORDER BY created_at DESC, event_id DESC
                LIMIT :limit OFFSET :offset
                """).param("limit", limit).param("offset", (page - 1L) * limit).query().listOfRows();
        long total = database.sql("SELECT COUNT(*) FROM refund_requests").query(Long.class).single();
        return Map.of("refunds", items, "page", page, "limit", limit, "total", total);
    }
}
