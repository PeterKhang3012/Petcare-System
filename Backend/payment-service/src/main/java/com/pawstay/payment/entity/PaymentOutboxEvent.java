package com.pawstay.payment.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "payment_outbox")
public class PaymentOutboxEvent {
    public enum Status { PENDING, DELIVERED, REJECTED, DEAD_LETTER }

    @Id
    @Column(name = "event_id", nullable = false, length = 36)
    private String id;

    @Column(name = "payment_id", nullable = false, length = 36)
    private String paymentId;

    @Column(name = "payload", nullable = false, columnDefinition = "TEXT", updatable = false)
    private String payload;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private Status status;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;

    @Column(name = "lease_until")
    private Instant leaseUntil;

    @Column(name = "lease_owner", length = 128)
    private String leaseOwner;

    @Column(name = "booking_outcome", length = 64)
    private String bookingOutcome;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PaymentOutboxEvent() {
    }

    public PaymentOutboxEvent(String id, String paymentId, String payload, Instant now) {
        this.id = id;
        this.paymentId = paymentId;
        this.payload = payload;
        this.status = Status.PENDING;
        this.nextAttemptAt = now;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public String getId() {
        return id;
    }

    public String getPayload() {
        return payload;
    }

    public Status getStatus() {
        return status;
    }

    public String getBookingOutcome() {
        return bookingOutcome;
    }

    public int getAttempts() {
        return attempts;
    }

    public boolean isLeasedBy(String owner) {
        return status == Status.PENDING && owner.equals(leaseOwner);
    }

    public void claim(String owner, Instant until, Instant now) {
        leaseOwner = owner;
        leaseUntil = until;
        attempts++;
        updatedAt = now;
    }

    public void finish(Status nextStatus, String outcome, Instant nextAttempt, Instant now) {
        status = nextStatus;
        bookingOutcome = outcome;
        nextAttemptAt = nextAttempt;
        leaseOwner = null;
        leaseUntil = null;
        updatedAt = now;
    }
}
