package com.pawstay.payment.client;

import com.pawstay.payment.exception.PaymentException;
import com.pawstay.payment.entity.PaymentAttempt;
import java.util.LinkedHashMap;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.client.RestClient;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;

@Component
public class VnpayClient {
    private static final DateTimeFormatter VNP_DATE = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneId.of("Asia/Ho_Chi_Minh"));

    private final String merchant;
    private final String secret;
    private final String paymentUrl;
    private final String returnUrl;

    public VnpayClient(@Value("${vnpay.tmn-code}") String merchant, @Value("${vnpay.hash-secret}") String secret,
                       @Value("${vnpay.payment-url}") String paymentUrl, @Value("${vnpay.return-url}") String returnUrl) {
        this.merchant = merchant;
        this.secret = secret;
        this.paymentUrl = paymentUrl;
        this.returnUrl = returnUrl;
    }

    public String paymentUrl(String reference, long amount, String ipAddress, Instant created, Instant expires) {
        if (merchant.isBlank() || secret.isBlank() || !isHttpUrl(paymentUrl, true) || !isHttpUrl(returnUrl, false)) {
            throw new PaymentException(HttpStatus.SERVICE_UNAVAILABLE, "VNPAY payment settings are incomplete or invalid");
        }
        var fields = new TreeMap<>(Map.ofEntries(
                Map.entry("vnp_Version", "2.1.0"),
                Map.entry("vnp_Command", "pay"),
                Map.entry("vnp_TmnCode", merchant),
                Map.entry("vnp_Amount", Long.toString(Math.multiplyExact(amount, 100L))),
                Map.entry("vnp_CurrCode", "VND"),
                Map.entry("vnp_TxnRef", reference),
                Map.entry("vnp_OrderInfo", "PawStay payment " + reference),
                Map.entry("vnp_OrderType", "other"),
                Map.entry("vnp_Locale", "vn"),
                Map.entry("vnp_ReturnUrl", returnUrl),
                Map.entry("vnp_IpAddr", ipAddress),
                Map.entry("vnp_CreateDate", VNP_DATE.format(created)),
                Map.entry("vnp_ExpireDate", VNP_DATE.format(expires))));
        String query = canonicalQuery(fields);
        return paymentUrl + "?" + query + "&vnp_SecureHash=" + HexFormat.of().formatHex(sign(query));
    }

    public Map<String, String> refundRequest(PaymentAttempt payment, String requestId, String staffId,
                                              String serverIp, Instant now) {
        if (merchant.isBlank() || secret.isBlank() || serverIp.isBlank()) {
            throw new PaymentException(HttpStatus.SERVICE_UNAVAILABLE, "VNPAY refund settings are incomplete");
        }
        var fields = new LinkedHashMap<String, String>();
        fields.put("vnp_RequestId", requestId);
        fields.put("vnp_Version", "2.1.0");
        fields.put("vnp_Command", "refund");
        fields.put("vnp_TmnCode", merchant);
        fields.put("vnp_TransactionType", "02");
        fields.put("vnp_TxnRef", payment.getVnpTxnRef());
        fields.put("vnp_Amount", Long.toString(Math.multiplyExact(payment.getAmount(), 100L)));
        // The original VNPAY transaction number is optional. The original merchant reference and creation date identify the payment.
        fields.put("vnp_TransactionDate", VNP_DATE.format(payment.getCreatedAt()));
        fields.put("vnp_CreateBy", staffId);
        fields.put("vnp_CreateDate", VNP_DATE.format(now));
        fields.put("vnp_IpAddr", serverIp);
        fields.put("vnp_OrderInfo", "PawStay refund " + requestId);
        String data = String.join("|", requestId, "2.1.0", "refund", merchant, "02", payment.getVnpTxnRef(),
                fields.get("vnp_Amount"), "", fields.get("vnp_TransactionDate"), staffId,
                fields.get("vnp_CreateDate"), serverIp, fields.get("vnp_OrderInfo"));
        fields.put("vnp_SecureHash", HexFormat.of().formatHex(sign(data)));
        return fields;
    }

    public Map<String, String> sendRefund(RestClient http, Map<String, String> request) {
        var response = http.post().uri("https://sandbox.vnpayment.vn/merchant_webapi/api/transaction")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).body(request)
                .retrieve().body(new ParameterizedTypeReference<Map<String, String>>() {});
        if (response == null || !"refund".equals(response.get("vnp_Command"))
                || !merchant.equals(response.get("vnp_TmnCode"))
                || !request.get("vnp_TxnRef").equals(response.get("vnp_TxnRef"))
                || !request.get("vnp_Amount").equals(response.get("vnp_Amount"))
                || !request.get("vnp_OrderInfo").equals(response.get("vnp_OrderInfo"))
                || !"02".equals(response.get("vnp_TransactionType"))) {
            throw new IllegalArgumentException("Unexpected refund response");
        }
        String hash = response.get("vnp_SecureHash");
        String data = java.util.stream.Stream.of("vnp_ResponseId", "vnp_Command", "vnp_ResponseCode", "vnp_Message",
                "vnp_TmnCode", "vnp_TxnRef", "vnp_Amount", "vnp_BankCode", "vnp_PayDate", "vnp_TransactionNo",
                "vnp_TransactionType", "vnp_TransactionStatus", "vnp_OrderInfo")
                .map(field -> java.util.Objects.toString(response.get(field), "")).collect(Collectors.joining("|"));
        if (hash == null || !hash.matches("[0-9a-fA-F]{128}")
                || !MessageDigest.isEqual(sign(data), HexFormat.of().parseHex(hash))) {
            throw new IllegalArgumentException("Invalid refund response signature");
        }
        return response;
    }

    public Map<String, String> queryPayment(RestClient http, PaymentAttempt payment, String requestId,
                                            String serverIp, Instant now) {
        if (merchant.isBlank() || secret.isBlank() || serverIp.isBlank()) {
            throw new PaymentException(HttpStatus.SERVICE_UNAVAILABLE, "VNPAY transaction settings are incomplete");
        }
        var request = new LinkedHashMap<String, String>();
        request.put("vnp_RequestId", requestId);
        request.put("vnp_Version", "2.1.0");
        request.put("vnp_Command", "querydr");
        request.put("vnp_TmnCode", merchant);
        request.put("vnp_TxnRef", payment.getVnpTxnRef());
        request.put("vnp_TransactionDate", VNP_DATE.format(payment.getCreatedAt()));
        request.put("vnp_CreateDate", VNP_DATE.format(now));
        request.put("vnp_IpAddr", serverIp);
        request.put("vnp_OrderInfo", "PawStay query " + requestId);
        request.put("vnp_SecureHash", HexFormat.of().formatHex(sign(String.join("|", request.values()))));
        var response = http.post().uri("https://sandbox.vnpayment.vn/merchant_webapi/api/transaction")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).body(request)
                .retrieve().body(new ParameterizedTypeReference<Map<String, String>>() {});
        if (response == null || !"querydr".equals(response.getOrDefault("vnp_Command", "querydr"))
                || !merchant.equals(response.get("vnp_TmnCode"))
                || !payment.getVnpTxnRef().equals(response.get("vnp_TxnRef"))
                || !request.get("vnp_OrderInfo").equals(response.get("vnp_OrderInfo"))) {
            throw new IllegalArgumentException("Unexpected payment query response");
        }
        String data = java.util.stream.Stream.of("vnp_ResponseId", "vnp_Command", "vnp_ResponseCode", "vnp_Message",
                "vnp_TmnCode", "vnp_TxnRef", "vnp_Amount", "vnp_BankCode", "vnp_PayDate", "vnp_TransactionNo",
                "vnp_TransactionType", "vnp_TransactionStatus", "vnp_OrderInfo", "vnp_PromotionCode", "vnp_PromotionAmount")
                .map(field -> java.util.Objects.toString(response.get(field), "")).collect(Collectors.joining("|"));
        String hash = response.get("vnp_SecureHash");
        if (hash == null || !hash.matches("[0-9a-fA-F]{128}")
                || !MessageDigest.isEqual(sign(data), HexFormat.of().parseHex(hash))) {
            throw new IllegalArgumentException("Invalid payment query signature");
        }
        return response;
    }

    public boolean hasValidCallbackSignature(MultiValueMap<String, String> parameters) {
        String suppliedHash = parameters.getFirst("vnp_SecureHash");
        if (merchant.isBlank() || secret.isBlank()) {
            throw new PaymentException(HttpStatus.SERVICE_UNAVAILABLE, "VNPAY callback settings are incomplete");
        }
        if (suppliedHash == null || !suppliedHash.matches("[0-9a-fA-F]{128}")
                || !merchant.equals(parameters.getFirst("vnp_TmnCode"))) {
            return false;
        }

        var signed = new TreeMap<String, String>();
        for (var entry : parameters.entrySet()) {
            String name = entry.getKey();
            if (!name.startsWith("vnp_")) {
                continue;
            }
            if (!name.matches("vnp_[A-Za-z0-9_]+") || entry.getValue().size() != 1) {
                return false;
            }
            if (!"vnp_SecureHash".equals(name) && !"vnp_SecureHashType".equals(name)) {
                String value = entry.getValue().getFirst();
                if (!StandardCharsets.US_ASCII.newEncoder().canEncode(value)) {
                    return false;
                }
                if (!value.isEmpty()) {
                    signed.put(name, value);
                }
            }
        }
        return MessageDigest.isEqual(sign(canonicalQuery(signed)), HexFormat.of().parseHex(suppliedHash));
    }

    // VNPAY 2.1.0 signs the alphabetically sorted, form-encoded fields sent in the query.
    private String canonicalQuery(TreeMap<String, String> fields) {
        return fields.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + URLEncoder.encode(entry.getValue(), StandardCharsets.US_ASCII))
                .collect(Collectors.joining("&"));
    }

    private byte[] sign(String query) {
        try {
            Mac mac = Mac.getInstance("HmacSHA512");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
            return mac.doFinal(query.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException exception) {
            throw new PaymentException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to sign VNPAY payment data");
        }
    }

    private boolean isHttpUrl(String value, boolean gateway) {
        try {
            URI uri = URI.create(value);
            return uri.getHost() != null && uri.getUserInfo() == null && uri.getFragment() == null
                    && ("https".equalsIgnoreCase(uri.getScheme())
                        || (!gateway && "http".equalsIgnoreCase(uri.getScheme())))
                    && (!gateway || uri.getRawQuery() == null);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }
}
