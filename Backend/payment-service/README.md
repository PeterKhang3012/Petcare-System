# PawStay Payment Service

Java 21, Spring Boot 4.2.0 and a dedicated MySQL database. Flyway runs schema migrations and Hibernate validates the schema at startup.

## Run locally

1. Create an empty MySQL 8.4 database named `payment_db` and an account with migration and data privileges scoped to that database.
2. Set `LOCAL_PAYMENT_PAYMENT_DB_URL`, `LOCAL_PAYMENT_PAYMENT_DB_USERNAME` and `LOCAL_PAYMENT_PAYMENT_DB_PASSWORD` in the root `.env`. Start from the repository root with `node scripts/run-local.cjs payment`.
3. The default local port is 8084.

The create and read APIs require Auth configuration. Creating a payment additionally requires Booking and VNPAY payment and return URL configuration. Keep merchant secrets and service tokens in environment variables.

## Run with Docker Compose

From the repository root, configure the root `.env` using `.env.example` and run:

```powershell
docker compose up -d --build --wait
```

Compose starts Payment with its own MySQL 8.4 container and runs Flyway at startup. It connects to Booking and Auth by service name on the Compose network. Keep VNPAY settings in the root `.env`. The host Payment port defaults to 8084. If you change `PAYMENT_HOST_PORT`, update the local browser return URL accordingly. MySQL initialization credentials apply when the volume is first created.

## Verify

From the repository root, run `node scripts/run-local.cjs payment verify`. To also run the MySQL integration tests, point the database variables at a disposable `payment_db` and set `PAYMENT_MYSQL_TEST=true`. Tests apply migrations and roll back their data.

`payment_attempts` stores amounts in integer VND and tracks gateway verification. `payment_outbox` persists event payloads, delivery state and lease metadata. The outbox foreign key references only the local payment attempt.

## Payment Core API

| Method and path | Request | Result |
| --- | --- | --- |
| POST /api/payments | Bearer JWT, Idempotency-Key, JSON with booking_id and policy_accepted set to true | 201 for creation or 200 for replay. Includes the signed payment_url while the hold is active. |
| GET /api/payments/{paymentId} | Bearer JWT | 200 with payment details for the owner, including `verified_at` once a final gateway result has been verified. Returns 404 when no owned payment matches. |

Use the same Idempotency-Key when retrying creation for the same booking. A key already used for a different booking by the same owner returns 409. Amount is read from Booking. Set AUTH_SERVICE_URL to the running Auth service origin and VNPAY_RETURN_URL to an absolute URL for Payment. For a local setup on port 8084, the return URL is http://localhost:8084/api/payments/vnpay/return. The Return handler works with or without a frontend.

## VNPAY callbacks

- `GET /api/payments/vnpay/ipn` is the VNPAY server callback. Register a public HTTPS address for this path with the sandbox merchant. The service validates the checksum, merchant, transaction reference and amount before it records a final result. It replies with VNPAY's `RspCode` and `Message` fields. Unclear results remain pending for reconciliation.
- `GET /api/payments/vnpay/return` is the browser callback. Set `VNPAY_RETURN_URL` to this endpoint. With `PAYMENT_FRONTEND_RETURN_URL` blank in standalone mode, it displays a neutral JSON message. With a valid frontend URL, it adds only the payment ID derived from a valid-format reference. The browser callback never updates payment state. Compose defaults to `http://localhost:5173/payments/return` and reads overrides from the root `.env`.
- A final IPN result and its Booking Outbox event are committed in one database transaction. The Outbox worker sends those events to Booking. Only a receipt confirming acceptance sets DELIVERED. A final business rejection sets REJECTED, and permanent errors or exhausted retries set DEAD_LETTER.

With `PAYMENT_MYSQL_TEST=true`, the integration suite includes signed callback fixtures sent over HTTP, including simultaneous duplicate callbacks and a late successful payment. These fixtures verify local handling. Run a separate sandbox transaction to verify VNPAY connectivity.

## Outbox delivery

The worker is enabled by default. Set OUTBOX_ENABLED=false to pause delivery, OUTBOX_BATCH_SIZE to cap work per poll, OUTBOX_POLL_DELAY for the polling interval in milliseconds, and OUTBOX_MAX_ATTEMPTS to bound attempts. Retries keep the stored event unchanged and use exponential backoff starting at OUTBOX_RETRY_DELAY, capped at five minutes. A 60-second database lease preserves work across restarts.

The authenticated Payment GET endpoint exposes booking_sync_status and booking_sync_outcome when the payment has an Outbox event. Review REJECTED or DEAD_LETTER records using the reason and event ID before taking operational action.

See [Postman walkthrough](run_tutorial.md) for setup, request bodies, headers and expected responses.

## STAFF transactions and VNPAY Sandbox refunds

Set a distinct `BOOKING_TO_PAYMENT_TOKEN` for Booking and Payment to enable delivery of refund requests, and configure `VNPAY_REFUND_SERVER_IP` for Payment to send the merchant server IP in Sandbox requests. Use Sandbox merchant credentials.

STAFF endpoints under `/api/payments/staff` list transactions and exceptions, run a signed `querydr` for the original payment, and list and confirm refund requests. The amount comes from the verified original payment. Confirmation is recorded before sending a full refund to Sandbox, and a second confirmation cannot resend it. When the refund response is missing, unverified, or pending, the request stays `PROCESSING` for manual reconciliation with VNPAY. Staff cannot edit the amount or set a terminal result.
