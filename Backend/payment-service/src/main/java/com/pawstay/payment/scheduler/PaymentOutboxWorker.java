package com.pawstay.payment.scheduler;

import com.pawstay.payment.client.BookingClient;
import com.pawstay.payment.entity.PaymentOutboxEvent;
import com.pawstay.payment.repository.PaymentOutboxRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class PaymentOutboxWorker {
    private static final Logger LOG = LoggerFactory.getLogger(PaymentOutboxWorker.class);
    private static final long LEASE_SECONDS = 60;
    private static final long MAX_RETRY_DELAY_MS = 300_000;

    private final PaymentOutboxRepository outbox;
    private final BookingClient booking;
    private final TransactionTemplate transaction;
    private final Clock clock;
    private final int batchSize;
    private final int maxAttempts;
    private final long retryDelayMs;

    public PaymentOutboxWorker(PaymentOutboxRepository outbox, BookingClient booking,
                               PlatformTransactionManager transactions, Clock clock,
                               @Value("${payment.outbox.batch-size}") int batchSize,
                               @Value("${payment.outbox.max-attempts}") int maxAttempts,
                               @Value("${payment.outbox.retry-delay-ms}") long retryDelayMs) {
        if (batchSize < 1 || maxAttempts < 1 || retryDelayMs < 1 || retryDelayMs > MAX_RETRY_DELAY_MS) {
            throw new IllegalArgumentException("Invalid Payment Outbox settings");
        }
        this.outbox = outbox;
        this.booking = booking;
        this.transaction = new TransactionTemplate(transactions);
        this.clock = clock;
        this.batchSize = batchSize;
        this.maxAttempts = maxAttempts;
        this.retryDelayMs = retryDelayMs;
    }

    private record Claim(String id, String payload, String leaseOwner, int attempts) {}

    @Scheduled(fixedDelayString = "${payment.outbox.poll-delay-ms}")
    public void poll() {
        if (!booking.isConfigured()) {
            return;
        }
        for (int index = 0; index < batchSize; index++) {
            Claim claim = transaction.execute(status -> claimNext());
            if (claim == null) {
                return;
            }
            if (claim.payload() == null) {
                continue;
            }
            // The HTTP call runs after the lease commits, outside any database transaction.
            var delivery = booking.deliverPaymentEvent(claim.id(), claim.payload());
            transaction.executeWithoutResult(status -> complete(claim, delivery));
        }
    }

    private Claim claimNext() {
        Instant now = clock.instant();
        var found = outbox.lockNextDue(now);
        if (found.isEmpty()) {
            return null;
        }
        var event = found.get();
        if (event.getAttempts() >= maxAttempts) {
            event.finish(PaymentOutboxEvent.Status.DEAD_LETTER, "LEASE_RETRY_LIMIT", now, now);
            LOG.warn("Payment Outbox event {} exhausted retries after lease expiry", event.getId());
            return new Claim(event.getId(), null, null, event.getAttempts());
        }
        String owner = UUID.randomUUID().toString();
        event.claim(owner, now.plusSeconds(LEASE_SECONDS), now);
        return new Claim(event.getId(), event.getPayload(), owner, event.getAttempts());
    }

    private void complete(Claim claim, BookingClient.Delivery delivery) {
        var found = outbox.lockById(claim.id());
        if (found.isEmpty() || !found.get().isLeasedBy(claim.leaseOwner())) {
            return;
        }
        Instant now = clock.instant();
        var event = found.get();
        switch (delivery.kind()) {
            case ACCEPTED -> event.finish(PaymentOutboxEvent.Status.DELIVERED, delivery.outcome(), now, now);
            case REJECTED -> {
                event.finish(PaymentOutboxEvent.Status.REJECTED, delivery.outcome(), now, now);
                LOG.info("Booking did not confirm Payment Outbox event {} ({})", claim.id(), delivery.outcome());
            }
            case PERMANENT_FAILURE -> deadLetter(event, delivery.outcome(), now);
            case RETRY -> {
                if (claim.attempts() >= maxAttempts) {
                    deadLetter(event, delivery.outcome(), now);
                } else {
                    long delay = Math.min(MAX_RETRY_DELAY_MS, retryDelayMs * (1L << Math.min(claim.attempts() - 1, 19)));
                    event.finish(PaymentOutboxEvent.Status.PENDING, delivery.outcome(), now.plusMillis(delay), now);
                }
            }
        }
    }

    private void deadLetter(PaymentOutboxEvent event, String outcome, Instant now) {
        event.finish(PaymentOutboxEvent.Status.DEAD_LETTER, outcome, now, now);
        LOG.warn("Payment Outbox event {} requires attention ({})", event.getId(), outcome);
    }
}
