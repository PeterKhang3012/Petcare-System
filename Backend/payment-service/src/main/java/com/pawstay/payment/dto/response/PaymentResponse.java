package com.pawstay.payment.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PaymentResponse(
        @JsonProperty("payment_id") String paymentId,
        @JsonProperty("booking_id") String bookingId,
        long amount, String currency, String status,
        @JsonProperty("expires_at") Instant expiresAt,
        @JsonProperty("verified_at") Instant verifiedAt,
        @JsonProperty("payment_url") String paymentUrl,
        @JsonProperty("booking_sync_status") String bookingSyncStatus,
        @JsonProperty("booking_sync_outcome") String bookingSyncOutcome) {
}
