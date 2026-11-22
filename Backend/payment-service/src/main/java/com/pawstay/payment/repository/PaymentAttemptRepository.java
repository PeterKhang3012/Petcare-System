package com.pawstay.payment.repository;

import com.pawstay.payment.entity.PaymentAttempt;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentAttemptRepository extends JpaRepository<PaymentAttempt, String> {
    Optional<PaymentAttempt> findByOwnerIdAndIdempotencyKey(String ownerId, String idempotencyKey);

    Optional<PaymentAttempt> findByVnpTxnRef(String vnpTxnRef);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select attempt from PaymentAttempt attempt where attempt.vnpTxnRef = :reference")
    Optional<PaymentAttempt> findByVnpTxnRefForUpdate(@Param("reference") String reference);

    Optional<PaymentAttempt> findByIdAndOwnerId(String id, String ownerId);
}
