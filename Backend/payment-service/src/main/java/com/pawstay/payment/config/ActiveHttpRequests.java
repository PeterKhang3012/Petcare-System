package com.pawstay.payment.config;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
class ActiveHttpRequests extends OncePerRequestFilter {
    private final AtomicInteger active = new AtomicInteger();

    ActiveHttpRequests(MeterRegistry registry) {
        Gauge.builder("pawstay.http.active.requests", active, AtomicInteger::get)
                .description("Active HTTP requests")
                .register(registry);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getServletPath().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        active.incrementAndGet();
        try {
            chain.doFilter(request, response);
        } finally {
            active.decrementAndGet();
        }
    }
}
