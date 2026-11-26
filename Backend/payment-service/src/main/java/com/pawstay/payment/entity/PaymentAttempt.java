package com.pawstay.payment.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "payment_attempts")
public class PaymentAttempt {
    public enum Status { PENDING, SUCCEEDED, FAILED }

    @Id
    @Column(name = "payment_id", nullable = false, length = 36)
    private String id;

    @Column(name = "booking_id", nullable = false, length = 24)
    private String bookingId;

    @Column(name = "owner_id", nullable = false, length = 24)
    private String ownerId;

    @Column(name = "idempotency_key", nullable = false, length = 128)
    private String idempotencyKey;

    @Column(name = "vnp_txn_ref", nullable = false, length = 100)
    private String vnpTxnRef;

    @Column(name = "amount", nullable = false)
    private long amount;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private Status status;

    @Column(name = "booking_expires_at", nullable = false)
    private Instant bookingExpiresAt;

    @Column(name = "vnp_transaction_no", length = 32)
    private String vnpTransactionNo;

    @Column(name = "vnp_response_code", length = 8)
    private String vnpResponseCode;

    @Column(name = "vnp_transaction_status", length = 8)
    private String vnpTransactionStatus;

    @Column(name = "verified_at")
    private Instant verifiedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "payment_url", columnDefinition = "TEXT", updatable = false)
    private String paymentUrl;

    protected PaymentAttempt() {
    }

    public PaymentAttempt(String id, String bookingId, String ownerId, String idempotencyKey,
                          String vnpTxnRef, long amount, String currency, Instant bookingExpiresAt, Instant now, String paymentUrl) {
        this.id = id;
        this.bookingId = bookingId;
        this.ownerId = ownerId;
        this.idempotencyKey = idempotencyKey;
        this.vnpTxnRef = vnpTxnRef;
        this.amount = amount;
        this.currency = currency;
        this.bookingExpiresAt = bookingExpiresAt;
        this.status = Status.PENDING;
        this.paymentUrl = paymentUrl;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public String getId() {
        return id;
    }

    public String getBookingId() {
        return bookingId;
    }

    public long getAmount() {
        return amount;
    }

    public String getCurrency() {
        return currency;
    }

    public Status getStatus() {
        return status;
    }

    public Instant getBookingExpiresAt() {
        return bookingExpiresAt;
    }

    public String getPaymentUrl() {
        return paymentUrl;
    }

    public Instant getVerifiedAt() {
        return verifiedAt;
    }

    public void recordGatewayResult(Status result, String transactionNo, String responseCode,
                                    String transactionStatus, Instant now) {
        if (status != Status.PENDING || result == Status.PENDING) {
            throw new IllegalStateException("Gateway result requires a pending payment and a final result");
        }
        status = result;
        vnpTransactionNo = transactionNo;
        vnpResponseCode = responseCode;
        vnpTransactionStatus = transactionStatus;
        verifiedAt = now;
        updatedAt = now;
    }
}
