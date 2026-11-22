package com.pawstay.payment.controller;

import com.pawstay.payment.client.AuthClient;
import com.pawstay.payment.dto.request.CreatePaymentRequest;
import com.pawstay.payment.dto.response.PaymentResponse;
import com.pawstay.payment.exception.PaymentException;
import com.pawstay.payment.service.PaymentService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
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
public class PaymentController {
    private final PaymentService payments;
    private final AuthClient auth;

    public PaymentController(PaymentService payments, AuthClient auth) {
        this.payments = payments;
        this.auth = auth;
    }

    @PostMapping
    ResponseEntity<PaymentResponse> create(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
                                           @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                           @Valid @RequestBody CreatePaymentRequest request, HttpServletRequest servletRequest) {
        String owner = auth.requireCustomer(authorization);
        var result = payments.create(owner, request.bookingId(), key, servletRequest.getRemoteAddr());
        return ResponseEntity.status(result.replayed() ? HttpStatus.OK : HttpStatus.CREATED).body(result.payment());
    }

    @GetMapping("/{paymentId}")
    PaymentResponse find(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
                         @PathVariable String paymentId) {
        String owner = auth.requireCustomer(authorization);
        if (!paymentId.matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")) {
            throw new PaymentException(HttpStatus.BAD_REQUEST, "Invalid payment ID");
        }
        return payments.find(owner, paymentId);
    }
}
