package com.pawstay.payment.controller;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class VnpayBrowserReturnTests {
    @Test
    void redirectsWithOnlyThePaymentIdFromTheGateway() throws Exception {
        String destination = "http://localhost:5173/payments/return";
        var mvc = MockMvcBuilders.standaloneSetup(new VnpayCallbackController(null, destination)).build();
        mvc.perform(get("/api/payments/vnpay/return")
                        .param("vnp_TxnRef", "0123456789abcdef0123456789abcdef")
                        .param("vnp_ResponseCode", "00")
                        .param("vnp_Amount", "123000"))
                .andExpect(status().isSeeOther())
                .andExpect(header().string("Location", destination + "?payment_id=01234567-89ab-cdef-0123-456789abcdef"))
                .andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(get("/api/payments/vnpay/return").param("vnp_TxnRef", "invalid"))
                .andExpect(status().isSeeOther())
                .andExpect(header().string("Location", destination));
    }
}
