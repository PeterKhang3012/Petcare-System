CREATE TABLE refund_requests (
    event_id CHAR(36) NOT NULL PRIMARY KEY,
    payment_id CHAR(36) NOT NULL,
    booking_id CHAR(24) NOT NULL,
    amount BIGINT NOT NULL,
    currency CHAR(3) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    status VARCHAR(16) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    confirmed_at DATETIME(6),
    confirmed_by CHAR(24),
    gateway_transaction_no VARCHAR(15),
    gateway_response_code VARCHAR(2),
    gateway_status VARCHAR(2),
    gateway_check VARCHAR(32),
    UNIQUE KEY ux_refunds_payment (payment_id),
    KEY ix_refunds_created (created_at, event_id)
);

CREATE TABLE payment_reconciliations (
    request_id CHAR(32) NOT NULL PRIMARY KEY,
    payment_id CHAR(36) NOT NULL,
    requested_by CHAR(24) NOT NULL,
    requested_at DATETIME(6) NOT NULL,
    result VARCHAR(16) NOT NULL,
    response_code VARCHAR(2),
    transaction_status VARCHAR(2),
    KEY ix_reconciliation_payment (payment_id, requested_at, request_id)
);
