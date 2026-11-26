package com.pawstay.payment.controller;

import com.pawstay.payment.dto.response.VnpayIpnResponse;
import com.pawstay.payment.service.VnpayIpnService;
import java.net.URI;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

@RestController
@RequestMapping("/api/payments/vnpay")
public class VnpayCallbackController {
    private static final Logger LOG = LoggerFactory.getLogger(VnpayCallbackController.class);
    private final VnpayIpnService ipn;
    private final String frontendReturnUrl;

    public VnpayCallbackController(VnpayIpnService ipn,
                                    @Value("${payment.frontend-return-url:}") String frontendReturnUrl) {
        this.ipn = ipn;
        this.frontendReturnUrl = frontendReturnUrl;
    }

    @GetMapping("/ipn")
    VnpayIpnResponse ipn(@RequestParam MultiValueMap<String, String> parameters) {
        try {
            return ipn.handle(parameters);
        } catch (RuntimeException exception) {
            // Also covers a commit failure from the transactional service. VNPAY can retry the callback.
            LOG.error("VNPAY IPN could not be recorded ({})", exception.getClass().getSimpleName());
            return VnpayIpnResponse.RETRY;
        }
    }

    @GetMapping("/return")
    ResponseEntity<?> browserReturn(@RequestParam MultiValueMap<String, String> parameters) {
        if (!frontendReturnUrl.isBlank()) {
            try {
                URI location = URI.create(frontendReturnUrl);
                if (location.getHost() != null && location.getUserInfo() == null
                        && ("https".equalsIgnoreCase(location.getScheme()) || "http".equalsIgnoreCase(location.getScheme()))) {
                    var redirect = UriComponentsBuilder.fromUri(location).replaceQueryParam("payment_id");
                    var references = parameters.get("vnp_TxnRef");
                    if (references != null && references.size() == 1) {
                        String reference = references.getFirst();
                        if (reference.matches("[0-9a-f]{32}")) {
                            // Lookup only. The frontend reads the result from the owner-scoped Payment API.
                            String paymentId = reference.replaceFirst(
                                    "^(.{8})(.{4})(.{4})(.{4})(.{12})$", "$1-$2-$3-$4-$5");
                            redirect.replaceQueryParam("payment_id", paymentId);
                        }
                    }
                    return ResponseEntity.status(HttpStatus.SEE_OTHER).location(redirect.build(true).toUri())
                            .cacheControl(CacheControl.noStore()).build();
                }
            } catch (IllegalArgumentException exception) {
                LOG.warn("Invalid Payment frontend return URL");
            }
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of(
                "message", "Payment return received. Check the payment status through the authenticated Payment API."));
    }
}
