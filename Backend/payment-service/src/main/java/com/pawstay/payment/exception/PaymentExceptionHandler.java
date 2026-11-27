package com.pawstay.payment.exception;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class PaymentExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(PaymentExceptionHandler.class);

    record ErrorResponse(Instant timestamp, int status, String error, String message, String path) {}

    @ExceptionHandler(PaymentException.class)
    ResponseEntity<ErrorResponse> business(PaymentException exception, HttpServletRequest request) {
        if (exception.status().is5xxServerError()) {
            LOG.warn("Payment request failed: {}", exception.getMessage());
        }
        return reply(exception.status(), exception.getMessage(), request);
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class})
    ResponseEntity<ErrorResponse> invalid(Exception exception, HttpServletRequest request) {
        return reply(HttpStatus.BAD_REQUEST, "Invalid payment request", request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorResponse> unexpected(Exception exception, HttpServletRequest request) {
        LOG.error("Unexpected payment request failure ({})", exception.getClass().getSimpleName());
        return reply(HttpStatus.INTERNAL_SERVER_ERROR, "Payment processing failed", request);
    }

    private ResponseEntity<ErrorResponse> reply(HttpStatus status, String message, HttpServletRequest request) {
        return ResponseEntity.status(status)
                .body(new ErrorResponse(Instant.now(), status.value(), status.name(), message, request.getRequestURI()));
    }
}
