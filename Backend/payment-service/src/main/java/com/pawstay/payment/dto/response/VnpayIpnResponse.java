package com.pawstay.payment.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record VnpayIpnResponse(@JsonProperty("RspCode") String code, @JsonProperty("Message") String message) {
    public static final VnpayIpnResponse RECORDED = new VnpayIpnResponse("00", "Confirm Success");
    public static final VnpayIpnResponse NOT_FOUND = new VnpayIpnResponse("01", "Order not found");
    public static final VnpayIpnResponse ALREADY_RECORDED = new VnpayIpnResponse("02", "Order already confirmed");
    public static final VnpayIpnResponse INVALID_AMOUNT = new VnpayIpnResponse("04", "Invalid amount");
    public static final VnpayIpnResponse INVALID_CHECKSUM = new VnpayIpnResponse("97", "Invalid checksum");
    public static final VnpayIpnResponse RETRY = new VnpayIpnResponse("99", "Unable to record a final result");
}
