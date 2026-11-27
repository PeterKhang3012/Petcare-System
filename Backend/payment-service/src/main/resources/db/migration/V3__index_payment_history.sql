CREATE INDEX ix_payment_owner_created ON payment_attempts (owner_id, created_at, payment_id);
