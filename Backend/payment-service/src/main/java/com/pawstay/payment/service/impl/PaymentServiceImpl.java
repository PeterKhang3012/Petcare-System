package com.pawstay.payment.service.impl;

import com.pawstay.payment.client.BookingClient;
import com.pawstay.payment.client.VnpayClient;
import com.pawstay.payment.dto.response.PaymentResponse;
import com.pawstay.payment.entity.PaymentAttempt;
import com.pawstay.payment.exception.PaymentException;
import com.pawstay.payment.repository.PaymentAttemptRepository;
import com.pawstay.payment.repository.PaymentOutboxRepository;
import com.pawstay.payment.service.PaymentService;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class PaymentServiceImpl implements PaymentService {
    private final PaymentAttemptRepository attempts;
    private final PaymentOutboxRepository outbox;
    private final BookingClient booking;
    private final VnpayClient vnpay;
    private final Clock clock;

    public PaymentServiceImpl(PaymentAttemptRepository attempts, PaymentOutboxRepository outbox,
                              BookingClient booking, VnpayClient vnpay, Clock clock) {
        this.attempts = attempts;
        this.outbox = outbox;
        this.booking = booking;
        this.vnpay = vnpay;
        this.clock = clock;
    }

    @Override
    public Creation create(String owner, String bookingId, String key, String ipAddress) {
        if (key == null || !key.matches("[A-Za-z0-9._:-]{1,128}")) {
            throw new PaymentException(HttpStatus.BAD_REQUEST, "A valid Idempotency-Key is required");
        }
        var existing = attempts.findByOwnerIdAndIdempotencyKey(owner, key);
        if (existing.isPresent()) {
            return replay(existing.get(), bookingId);
        }

        var context = booking.paymentContext(bookingId);
        if (!owner.equals(context.ownerId())) {
            throw new PaymentException(HttpStatus.FORBIDDEN, "Booking belongs to another customer");
        }
        Instant now = clock.instant();
        if (context.expiresAt().getEpochSecond() <= now.getEpochSecond()) {
            throw new PaymentException(HttpStatus.CONFLICT, "Booking is no longer payable");
        }

        String id = UUID.randomUUID().toString();
        String reference = id.replace("-", "");
        String url = vnpay.paymentUrl(reference, context.amount(), ipAddress, now, context.expiresAt());
        var attempt = new PaymentAttempt(id, bookingId, owner, key, reference,
                context.amount(), context.currency(), context.expiresAt(), now, url);

        // The repository transaction rolls back before the retry lookup when a concurrent insert wins.
        try {
            return new Creation(response(attempts.saveAndFlush(attempt), true), false);
        } catch (DataIntegrityViolationException exception) {
            var winner = attempts.findByOwnerIdAndIdempotencyKey(owner, key);
            if (winner.isEmpty()) {
                throw exception;
            }
            return replay(winner.get(), bookingId);
        }
    }

    @Override
    public PaymentResponse find(String owner, String paymentId) {
        var attempt = attempts.findByIdAndOwnerId(paymentId, owner)
                .orElseThrow(() -> new PaymentException(HttpStatus.NOT_FOUND, "Payment not found"));
        return response(attempt, false);
    }

    private Creation replay(PaymentAttempt attempt, String bookingId) {
        if (!bookingId.equals(attempt.getBookingId())) {
            throw new PaymentException(HttpStatus.CONFLICT, "Idempotency-Key was already used for another booking");
        }
        return new Creation(response(attempt, true), true);
    }

    private PaymentResponse response(PaymentAttempt attempt, boolean includeUrl) {
        String url = includeUrl && attempt.getStatus() == PaymentAttempt.Status.PENDING
                && attempt.getBookingExpiresAt().isAfter(clock.instant()) ? attempt.getPaymentUrl() : null;
        var event = outbox.findFirstByPaymentIdOrderByCreatedAtDescIdDesc(attempt.getId()).orElse(null);
        return new PaymentResponse(attempt.getId(), attempt.getBookingId(), attempt.getAmount(), attempt.getCurrency(),
                attempt.getStatus().name(), attempt.getBookingExpiresAt(), url,
                event == null ? null : event.getStatus().name(), event == null ? null : event.getBookingOutcome());
    }
}
