package com.pawstay.payment;

import static org.junit.jupiter.api.Assertions.*;

import com.pawstay.payment.client.VnpayClient;
import com.pawstay.payment.exception.PaymentException;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class VnpayClientTests {
    private static final Instant CREATED = Instant.parse("2026-11-22T12:00:00Z");
    private static final String BASE = "https://example.test/pay";

    @Test
    void signsSortedFieldsAndFormatsAmountAndVietnamTimestamps() {
        var client = new VnpayClient("TEST", "test-secret", BASE, "http://localhost:8084/api/payments/vnpay/return");
        String actual = client.paymentUrl("abc123", 150_000, "127.0.0.1", CREATED, CREATED.plusSeconds(900));
        assertEquals(BASE + "?vnp_Amount=15000000&vnp_Command=pay&vnp_CreateDate=20261122190000"
                + "&vnp_CurrCode=VND&vnp_ExpireDate=20261122191500&vnp_IpAddr=127.0.0.1"
                + "&vnp_Locale=vn&vnp_OrderInfo=PawStay+payment+abc123&vnp_OrderType=other"
                + "&vnp_ReturnUrl=http%3A%2F%2Flocalhost%3A8084%2Fapi%2Fpayments%2Fvnpay%2Freturn"
                + "&vnp_TmnCode=TEST&vnp_TxnRef=abc123&vnp_Version=2.1.0"
                + "&vnp_SecureHash=6a17deaa629e13a7d76dbd25c31816553c3b7693b97e0ff44cd3a969262d8ae23b15e6d492c50ccf66cba3ebbf88496f82367e09ef09a48f793b5568cbdeb466", actual);
    }

    @Test
    void rejectsPlaceholderReturnUrl() {
        var client = new VnpayClient("TEST", "test-secret", BASE, "<return-url>");
        assertThrows(PaymentException.class,
                () -> client.paymentUrl("abc123", 150_000, "127.0.0.1", CREATED, CREATED.plusSeconds(900)));
    }
}
