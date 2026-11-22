package com.pawstay.payment.repository;

import com.pawstay.payment.entity.PaymentOutboxEvent;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface PaymentOutboxRepository extends JpaRepository<PaymentOutboxEvent, String> {
    @Query(value = """
            SELECT * FROM payment_outbox
            WHERE status = 'PENDING' AND next_attempt_at <= :now
              AND (lease_until IS NULL OR lease_until <= :now)
            ORDER BY next_attempt_at, event_id
            LIMIT 1 FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    Optional<PaymentOutboxEvent> lockNextDue(@Param("now") Instant now);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select event from PaymentOutboxEvent event where event.id = :id")
    Optional<PaymentOutboxEvent> lockById(@Param("id") String id);

    Optional<PaymentOutboxEvent> findFirstByPaymentIdOrderByCreatedAtDescIdDesc(String paymentId);
}
