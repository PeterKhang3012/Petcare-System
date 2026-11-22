package com.pawstay.payment.service.impl;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.pawstay.payment.client.VnpayClient;
import com.pawstay.payment.dto.response.VnpayIpnResponse;
import com.pawstay.payment.entity.PaymentAttempt;
import com.pawstay.payment.entity.PaymentOutboxEvent;
import com.pawstay.payment.repository.PaymentAttemptRepository;
import com.pawstay.payment.repository.PaymentOutboxRepository;
import com.pawstay.payment.service.VnpayIpnService;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.MultiValueMap;
import tools.jackson.databind.ObjectMapper;

@Service
public class VnpayIpnServiceImpl implements VnpayIpnService {
    private final VnpayClient vnpay;
    private final PaymentAttemptRepository attempts;
    private final PaymentOutboxRepository outbox;
    private final ObjectMapper json;
    private final Clock clock;

    public VnpayIpnServiceImpl(VnpayClient vnpay, PaymentAttemptRepository attempts,
                               PaymentOutboxRepository outbox, ObjectMapper json, Clock clock) {
        this.vnpay = vnpay;
        this.attempts = attempts;
        this.outbox = outbox;
        this.json = json;
        this.clock = clock;
    }

    record BookingEvent(@JsonProperty("event_id") String eventId,
                        @JsonProperty("booking_id") String bookingId,
                        @JsonProperty("payment_id") String paymentId,
                        long amount, String currency, String result) {}

    @Override
    @Transactional
    public VnpayIpnResponse handle(MultiValueMap<String, String> parameters) {
        if (!vnpay.hasValidCallbackSignature(parameters)) {
            return VnpayIpnResponse.INVALID_CHECKSUM;
        }

        String reference = parameters.getFirst("vnp_TxnRef");
        if (reference == null || !reference.matches("[A-Za-z0-9]{1,100}")) {
            return VnpayIpnResponse.NOT_FOUND;
        }

        // Lock the attempt until both the verified state and its Outbox event commit.
        var found = attempts.findByVnpTxnRefForUpdate(reference);
        if (found.isEmpty()) {
            return VnpayIpnResponse.NOT_FOUND;
        }
        PaymentAttempt attempt = found.get();
        String amount = parameters.getFirst("vnp_Amount");
        if (amount == null || !amount.matches("[0-9]{1,12}")
                || Long.parseLong(amount) != Math.multiplyExact(attempt.getAmount(), 100L)) {
            return VnpayIpnResponse.INVALID_AMOUNT;
        }
        if (attempt.getStatus() != PaymentAttempt.Status.PENDING) {
            return VnpayIpnResponse.ALREADY_RECORDED;
        }

        String responseCode = parameters.getFirst("vnp_ResponseCode");
        String transactionStatus = parameters.getFirst("vnp_TransactionStatus");
        String transactionNo = parameters.getFirst("vnp_TransactionNo");
        if (responseCode == null || !responseCode.matches("[0-9]{2}")
                || (transactionNo != null && !transactionNo.matches("[0-9]{1,32}"))) {
            return VnpayIpnResponse.RETRY;
        }

        PaymentAttempt.Status result;
        if ("00".equals(responseCode) && "00".equals(transactionStatus)
                && transactionNo != null && !transactionNo.matches("0+")) {
            result = PaymentAttempt.Status.SUCCEEDED;
        } else if (!"00".equals(responseCode) && !"07".equals(responseCode) && "02".equals(transactionStatus)) {
            result = PaymentAttempt.Status.FAILED;
        } else {
            return VnpayIpnResponse.RETRY;
        }

        // Even a late verified payment is recorded. Booking decides whether the hold can be confirmed.
        Instant now = clock.instant();
        attempt.recordGatewayResult(result, transactionNo, responseCode, transactionStatus, now);
        String eventId = UUID.randomUUID().toString();
        var event = new BookingEvent(eventId, attempt.getBookingId(), attempt.getId(),
                attempt.getAmount(), attempt.getCurrency(), result.name());
        outbox.save(new PaymentOutboxEvent(eventId, attempt.getId(), json.writeValueAsString(event), now));
        return VnpayIpnResponse.RECORDED;
    }
}
