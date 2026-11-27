package com.pawstay.payment;

import static org.junit.jupiter.api.Assertions.*;

import com.pawstay.payment.client.VnpayClient;
import com.pawstay.payment.exception.PaymentException;
import com.pawstay.payment.entity.PaymentAttempt;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

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
    void signsFullRefundUsingOriginalMerchantReferenceAndCreationDate() {
        var client = new VnpayClient("TEST", "test-secret", BASE, "http://localhost:8084/api/payments/vnpay/return");
        var payment = new PaymentAttempt("payment", "booking", "owner", "key", "abc123",
                150_000, "VND", CREATED.plusSeconds(900), CREATED, null);
        var request = client.refundRequest(payment, "refund123", "staff123", "127.0.0.1", CREATED.plusSeconds(900));
        assertEquals("02", request.get("vnp_TransactionType"));
        assertEquals("20261122190000", request.get("vnp_TransactionDate"));
        assertEquals("15000000", request.get("vnp_Amount"));
        assertEquals("b56248b33c7ae197bb77fb44ecee03d3ee2f7f6b045ae8b7941b6b84b08156881bc1537c6df8f966186b62db54c23474aad80db563e371e178b8c454e25d2a9e",
                request.get("vnp_SecureHash"));
    }

    @Test
    void verifiesSignedPendingRefundResponseBeforeUse() {
        var client = new VnpayClient("TEST", "test-secret", BASE, "http://localhost:8084/api/payments/vnpay/return");
        var payment = new PaymentAttempt("payment", "booking", "owner", "key", "abc123",
                150_000, "VND", CREATED.plusSeconds(900), CREATED, null);
        var request = client.refundRequest(payment, "refund123", "staff123", "127.0.0.1", CREATED.plusSeconds(900));
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        String response = """
                {
                    "vnp_ResponseId": "resp01",
                    "vnp_Command": "refund",
                    "vnp_ResponseCode": "00",
                    "vnp_Message": "Đang xử lý",
                    "vnp_TmnCode": "TEST",
                    "vnp_TxnRef": "abc123",
                    "vnp_Amount": "15000000",
                    "vnp_BankCode": "NCB",
                    "vnp_PayDate": "",
                    "vnp_TransactionNo": "73513",
                    "vnp_TransactionType": "02",
                    "vnp_TransactionStatus": "05",
                    "vnp_OrderInfo": "PawStay refund refund123",
                    "vnp_SecureHash": "487ee23fb58d03653902a746c740c880bf8f64c8311610e1cdc827af4e3661bfd3575f1dc81639eff9edd653bae54a687750555bc74979568ec7900ea952b32c"
                }
                """;
        String url = "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";
        server.expect(requestTo(url)).andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
        server.expect(requestTo(url)).andRespond(withSuccess(response.replace("73513", "73514"), MediaType.APPLICATION_JSON));
        var http = builder.build();
        assertEquals("05", client.sendRefund(http, request).get("vnp_TransactionStatus"));
        assertThrows(IllegalArgumentException.class, () -> client.sendRefund(http, request));
        server.verify();
    }

    @Test
    void rejectsPlaceholderReturnUrl() {
        var client = new VnpayClient("TEST", "test-secret", BASE, "<return-url>");
        assertThrows(PaymentException.class,
                () -> client.paymentUrl("abc123", 150_000, "127.0.0.1", CREATED, CREATED.plusSeconds(900)));
    }
}
