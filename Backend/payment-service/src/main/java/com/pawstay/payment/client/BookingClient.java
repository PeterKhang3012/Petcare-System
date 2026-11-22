package com.pawstay.payment.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.pawstay.payment.exception.PaymentException;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
public class BookingClient {
    private final RestClient http;
    private final String baseUrl;
    private final String token;

    public BookingClient(RestClient http, @Value("${booking.service.base-url}") String baseUrl,
                         @Value("${booking.service.internal-token}") String token) {
        this.http = http;
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.token = token;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Context(@JsonProperty("booking_id") String bookingId,
                          @JsonProperty("owner_id") String ownerId,
                          long amount, String currency,
                          @JsonProperty("expires_at") Instant expiresAt, String status) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Data(Context booking) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Response(boolean success, Data data) {}

    public Context paymentContext(String bookingId) {
        if (!isConfigured()) {
            throw new PaymentException(HttpStatus.SERVICE_UNAVAILABLE, "Booking connection is not configured");
        }
        Response response;
        try {
            response = http.get().uri(baseUrl + "/internal/bookings/{id}/payment-context", bookingId)
                    .header("X-Service-Token", token).retrieve().body(Response.class);
        } catch (RestClientResponseException exception) {
            throw switch (exception.getStatusCode().value()) {
                case 404 -> new PaymentException(HttpStatus.NOT_FOUND, "Booking not found");
                case 409 -> new PaymentException(HttpStatus.CONFLICT, "Booking is not payable");
                case 503 -> new PaymentException(HttpStatus.SERVICE_UNAVAILABLE, "Booking service unavailable");
                default -> new PaymentException(HttpStatus.BAD_GATEWAY, "Booking rejected the context request");
            };
        } catch (RestClientException | IllegalArgumentException exception) {
            throw new PaymentException(HttpStatus.SERVICE_UNAVAILABLE, "Booking service unavailable");
        }

        Context context = response != null && response.success() && response.data() != null
                ? response.data().booking() : null;
        if (context == null || !bookingId.equals(context.bookingId()) || context.ownerId() == null
                || !context.ownerId().matches("[a-f0-9]{24}") || context.expiresAt() == null
                || context.amount() <= 0 || context.amount() > 9_999_999_999L
                || !"VND".equals(context.currency()) || !"PENDING_PAYMENT".equals(context.status())) {
            throw new PaymentException(HttpStatus.BAD_GATEWAY, "Invalid Booking payment context");
        }
        return context;
    }

    public enum DeliveryKind { ACCEPTED, REJECTED, RETRY, PERMANENT_FAILURE }

    public record Delivery(DeliveryKind kind, String outcome) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record EventReceipt(Boolean accepted, String outcome, Boolean retryable) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record EventResponse(boolean success, EventReceipt data) {}

    public boolean isConfigured() {
        return !baseUrl.isBlank() && !token.isBlank();
    }

    public Delivery deliverPaymentEvent(String eventId, String payload) {
        EventResponse response;
        try {
            response = http.post().uri(baseUrl + "/internal/bookings/payment-events")
                    .header("X-Service-Token", token)
                    .header("X-Correlation-ID", eventId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve().body(EventResponse.class);
        } catch (RestClientResponseException exception) {
            int status = exception.getStatusCode().value();
            DeliveryKind kind = status >= 500 || status == 408 || status == 429
                    ? DeliveryKind.RETRY : DeliveryKind.PERMANENT_FAILURE;
            return new Delivery(kind, "BOOKING_HTTP_" + status);
        } catch (RestClientException exception) {
            return new Delivery(DeliveryKind.RETRY, "BOOKING_TRANSPORT_ERROR");
        } catch (IllegalArgumentException exception) {
            return new Delivery(DeliveryKind.PERMANENT_FAILURE, "INVALID_BOOKING_CONFIGURATION");
        }
        EventReceipt receipt = response != null && response.success() ? response.data() : null;
        if (receipt == null || receipt.accepted() == null || receipt.retryable() == null
                || receipt.outcome() == null || !receipt.outcome().matches("[A-Z_]{1,64}")) {
            return new Delivery(DeliveryKind.RETRY, "INVALID_BOOKING_RECEIPT");
        }
        if (receipt.retryable()) {
            return new Delivery(DeliveryKind.RETRY, receipt.outcome());
        }
        boolean confirmsBooking = "CONFIRMED".equals(receipt.outcome()) || "ALREADY_ACCEPTED".equals(receipt.outcome());
        if (receipt.accepted() != confirmsBooking) {
            return new Delivery(DeliveryKind.RETRY, "INVALID_BOOKING_RECEIPT");
        }
        return new Delivery(confirmsBooking ? DeliveryKind.ACCEPTED : DeliveryKind.REJECTED, receipt.outcome());
    }
}
