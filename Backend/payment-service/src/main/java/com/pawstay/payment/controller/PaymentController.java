package com.pawstay.payment.controller;

import com.pawstay.payment.client.AuthClient;
import com.pawstay.payment.dto.request.CreatePaymentRequest;
import com.pawstay.payment.dto.response.PaymentResponse;
import com.pawstay.payment.exception.PaymentException;
import com.pawstay.payment.service.PaymentService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/payments")
@Tag(name = "Payments")
@SecurityRequirement(name = "bearerAuth")
public class PaymentController {
    private final PaymentService payments;
    private final AuthClient auth;

    public PaymentController(PaymentService payments, AuthClient auth) {
        this.payments = payments;
        this.auth = auth;
    }

    @PostMapping
    @Operation(summary = "Create or resume a VNPAY payment",
            description = "Customer only. The amount and payable hold come from Booking.")
    @ApiResponse(responseCode = "200", description = "Existing attempt")
    @ApiResponse(responseCode = "201", description = "Attempt created")
    @ApiResponse(responseCode = "400", description = "Invalid body or Idempotency-Key")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "Customer role or booking ownership required")
    @ApiResponse(responseCode = "404", description = "Payable booking not found")
    @ApiResponse(responseCode = "409", description = "Hold expired or key reused for another booking")
    @ApiResponse(responseCode = "503", description = "A dependency is unavailable")
    ResponseEntity<PaymentResponse> create(@Parameter(hidden = true) @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
                                           @Parameter(in = ParameterIn.HEADER, required = true, description = "Reuse the same key to retry the request")
                                           @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                           @Valid @RequestBody CreatePaymentRequest request, HttpServletRequest servletRequest) {
        String owner = auth.requireCustomer(authorization);
        var result = payments.create(owner, request.bookingId(), key, servletRequest.getRemoteAddr());
        return ResponseEntity.status(result.replayed() ? HttpStatus.OK : HttpStatus.CREATED).body(result.payment());
    }

    @GetMapping("/{paymentId}")
    @Operation(summary = "Read a payment owned by the authenticated customer")
    @ApiResponse(responseCode = "200", description = "Payment status and amount")
    @ApiResponse(responseCode = "400", description = "Invalid payment ID")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "Customer role required")
    @ApiResponse(responseCode = "404", description = "Owned payment not found")
    @ApiResponse(responseCode = "503", description = "Auth unavailable")
    PaymentResponse find(@Parameter(hidden = true) @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
                         @PathVariable String paymentId) {
        String owner = auth.requireCustomer(authorization);
        if (!paymentId.matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")) {
            throw new PaymentException(HttpStatus.BAD_REQUEST, "Invalid payment ID");
        }
        return payments.find(owner, paymentId);
    }
}
