package com.pawstay.payment.service;

import com.pawstay.payment.dto.response.PaymentResponse;

public interface PaymentService {
    record Creation(PaymentResponse payment, boolean replayed) {}

    Creation create(String owner, String bookingId, String idempotencyKey, String ipAddress);

    PaymentResponse find(String owner, String paymentId);
}
