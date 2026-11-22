package com.pawstay.payment.client;

import com.pawstay.payment.exception.PaymentException;
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
            return mac.doFinal(query.getBytes(StandardCharsets.US_ASCII));
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
