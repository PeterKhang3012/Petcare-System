package com.pawstay.payment.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record CreatePaymentRequest(
        @JsonProperty("booking_id") @NotBlank @Pattern(regexp = "[a-f0-9]{24}") String bookingId,
        @JsonProperty("policy_accepted") @NotNull @AssertTrue Boolean policyAccepted) {
}
