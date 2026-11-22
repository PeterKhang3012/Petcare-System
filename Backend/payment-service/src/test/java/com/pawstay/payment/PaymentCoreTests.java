package com.pawstay.payment;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.pawstay.payment.client.BookingClient;
import com.pawstay.payment.client.VnpayClient;
import com.pawstay.payment.entity.PaymentAttempt;
import com.pawstay.payment.exception.PaymentException;
import com.pawstay.payment.repository.PaymentAttemptRepository;
import com.pawstay.payment.repository.PaymentOutboxRepository;
import com.pawstay.payment.service.impl.PaymentServiceImpl;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

class PaymentCoreTests {
    private static final String OWNER = "000000000000000000000001";
    private static final String BOOKING = "000000000000000000000002";
    private static final Instant NOW = Instant.parse("2026-11-22T12:00:00Z");
    private final PaymentAttemptRepository attempts = mock(PaymentAttemptRepository.class);
    private final BookingClient booking = mock(BookingClient.class);
    private final VnpayClient vnpay = mock(VnpayClient.class);
    private final PaymentServiceImpl service =
            new PaymentServiceImpl(attempts, mock(PaymentOutboxRepository.class), booking, vnpay, Clock.fixed(NOW, ZoneOffset.UTC));

    @BeforeEach
    void stubBooking() {
        when(booking.paymentContext(BOOKING)).thenReturn(context(OWNER, NOW.plusSeconds(900)));
    }

    @Test
    void createsPaymentWithBookingAmount() {
        when(vnpay.paymentUrl(any(), eq(150_000L), eq("127.0.0.1"), eq(NOW), eq(NOW.plusSeconds(900))))
                .thenReturn("https://example.test/payment");
        when(attempts.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        var result = service.create(OWNER, BOOKING, "checkout", "127.0.0.1");
        assertFalse(result.replayed());
        assertEquals(150_000, result.payment().amount());
        assertEquals("PENDING", result.payment().status());
        assertEquals("https://example.test/payment", result.payment().paymentUrl());
    }

    @Test
    void refusesAnotherOwnersBooking() {
        when(booking.paymentContext(BOOKING)).thenReturn(context("another-owner", NOW.plusSeconds(900)));
        assertStatus(HttpStatus.FORBIDDEN, () -> service.create(OWNER, BOOKING, "checkout", "127.0.0.1"));
        verifyNoInteractions(vnpay);
    }

    @Test
    void refusesExpiredBooking() {
        when(booking.paymentContext(BOOKING)).thenReturn(context(OWNER, NOW));
        assertStatus(HttpStatus.CONFLICT, () -> service.create(OWNER, BOOKING, "checkout", "127.0.0.1"));
        verifyNoInteractions(vnpay);
    }

    @Test
    void propagatesMissingBooking() {
        when(booking.paymentContext(BOOKING)).thenThrow(new PaymentException(HttpStatus.NOT_FOUND, "Booking not found"));
        assertStatus(HttpStatus.NOT_FOUND, () -> service.create(OWNER, BOOKING, "checkout", "127.0.0.1"));
        verifyNoInteractions(vnpay);
    }

    @Test
    void replaysSameUrlAndRejectsReusingKeyForAnotherBooking() {
        when(attempts.findByOwnerIdAndIdempotencyKey(OWNER, "checkout")).thenReturn(Optional.of(winner()));
        var replay = service.create(OWNER, BOOKING, "checkout", "127.0.0.2");
        assertTrue(replay.replayed());
        assertEquals("https://example.test/original", replay.payment().paymentUrl());
        assertStatus(HttpStatus.CONFLICT, () -> service.create(OWNER, "other-booking", "checkout", "127.0.0.1"));
        verifyNoInteractions(vnpay);
    }

    @Test
    void readsWinningPaymentAfterConcurrentInsertConflict() {
        when(attempts.findByOwnerIdAndIdempotencyKey(OWNER, "checkout"))
                .thenReturn(Optional.empty()).thenReturn(Optional.of(winner()));
        when(attempts.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("duplicate"));
        assertEquals("winner", service.create(OWNER, BOOKING, "checkout", "127.0.0.1").payment().paymentId());
    }

    @Test
    void hidesMissingAndOtherOwnersPayments() {
        assertStatus(HttpStatus.NOT_FOUND, () -> service.find(OWNER, "unknown"));
        verify(attempts).findByIdAndOwnerId("unknown", OWNER);
    }

    private BookingClient.Context context(String owner, Instant expiresAt) {
        return new BookingClient.Context(BOOKING, owner, 150_000, "VND", expiresAt, "PENDING_PAYMENT");
    }

    private PaymentAttempt winner() {
        return new PaymentAttempt("winner", BOOKING, OWNER, "checkout", "reference", 150_000,
                "VND", NOW.plusSeconds(900), NOW, "https://example.test/original");
    }

    private void assertStatus(HttpStatus status, org.junit.jupiter.api.function.Executable request) {
        assertEquals(status, assertThrows(PaymentException.class, request).status());
    }
}
