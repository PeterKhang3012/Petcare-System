package com.pawstay.payment.service;

import com.pawstay.payment.dto.response.VnpayIpnResponse;
import org.springframework.util.MultiValueMap;

public interface VnpayIpnService {
    VnpayIpnResponse handle(MultiValueMap<String, String> parameters);
}
