# PawStay Payment Service

Java 21, Spring Boot 4.2.0 and a dedicated MySQL database. Flyway runs schema migrations and Hibernate validates the schema at startup.

## Run locally

1. Create an empty MySQL 8.4 database named `payment_db` and an account with migration and data privileges scoped to that database.
2. Set `PAYMENT_DB_URL`, `PAYMENT_DB_USERNAME` and `PAYMENT_DB_PASSWORD` in the process environment. See `.env.example`. The service imports an optional .env as Java properties from the working directory. Use unquoted values and forward slashes for Windows paths. Process environment variables take precedence.
3. Run `mvn spring-boot:run`. The default port is 8084.

The create and read APIs require Auth configuration. Creating a payment additionally requires Booking and VNPAY payment and return URL configuration. Keep merchant secrets and service tokens in environment variables.

## Run with Docker Compose

From the repository root, configure the root `.env` using `.env.example` and run:

```powershell
docker compose up -d --build --wait
```

Compose starts Payment with its own MySQL 8.4 container and runs Flyway at startup. It connects to Booking on the Compose network and to Auth on the Windows host. Keep VNPAY settings in `Backend/payment-service/.env`. The host Payment port defaults to 8084. If you change `PAYMENT_HOST_PORT`, update the local browser return URL accordingly. MySQL initialization credentials apply when the volume is first created.

## Run with Docker Desktop

From this directory, build the image and start the container:

```powershell
docker build -t pawstay-payment:local .
$publicKey = (Resolve-Path ../auth-service/keys/public.pem).Path
docker run --rm --name pawstay-payment --env-file .env `
  --mount "type=bind,source=$publicKey,target=/app/keys/auth-public.pem,readonly" `
  -e JWT_PUBLIC_KEY_PATH=/app/keys/auth-public.pem -e PAYMENT_PORT=8084 `
  -p 127.0.0.1:8084:8084 pawstay-payment:local
```

For MySQL and Auth on Windows, set `PAYMENT_DB_URL=jdbc:mysql://host.docker.internal:3306/payment_db` and `AUTH_SERVICE_URL=http://host.docker.internal:3001` in the runtime environment. For Booking in Compose, add `--network <compose-network>` to the run command and set `BOOKING_SERVICE_URL=http://booking-service:3003`. Use `docker network ls` to find the Compose network. If MySQL is also in Docker, join its network and use its service name in the JDBC URL. Host MySQL must listen on an address reachable from Docker Desktop. The VNPAY browser return URL can still use `http://localhost:8084/api/payments/vnpay/return` for local testing. Use a MySQL account allowed to connect from the container and migrate `payment_db`.

## Verify

Run `mvn verify`. To also run the MySQL integration tests, point the database variables at a disposable `payment_db` and set `PAYMENT_MYSQL_TEST=true`. Tests apply migrations and roll back their data.

`payment_attempts` stores amounts in integer VND and tracks gateway verification. `payment_outbox` persists event payloads, delivery state and lease metadata. The outbox foreign key references only the local payment attempt.

## Payment Core API

| Method and path | Request | Result |
| --- | --- | --- |
| POST /api/payments | Bearer JWT, Idempotency-Key, JSON with booking_id | 201 for creation or 200 for replay. Includes the signed payment_url while the hold is active. |
| GET /api/payments/{paymentId} | Bearer JWT | 200 with payment_id, booking_id, amount, currency, status and expires_at for the owner. Returns 404 when no owned payment matches. |

Use the same Idempotency-Key when retrying creation for the same booking. A key already used for a different booking by the same owner returns 409. Amount is read from Booking. Set AUTH_SERVICE_URL to the running Auth service origin and VNPAY_RETURN_URL to an absolute URL for Payment. For a local setup on port 8084, the return URL is http://localhost:8084/api/payments/vnpay/return. The Return handler works with or without a frontend.

## VNPAY callbacks

- `GET /api/payments/vnpay/ipn` is the VNPAY server callback. Register a public HTTPS address for this path with the sandbox merchant. The service validates the checksum, merchant, transaction reference and amount before it records a final result. It replies with VNPAY's `RspCode` and `Message` fields. Unclear results remain pending for reconciliation.
- `GET /api/payments/vnpay/return` is the browser callback. Set `VNPAY_RETURN_URL` to this endpoint. With `PAYMENT_FRONTEND_RETURN_URL` blank, it displays a neutral JSON message. With a valid frontend URL, it redirects there without forwarding gateway parameters. The browser callback never updates payment state.
- A final IPN result and its Booking Outbox event are committed in one database transaction. The Outbox worker sends those events to Booking. Only a receipt confirming acceptance sets DELIVERED. A final business rejection sets REJECTED, and permanent errors or exhausted retries set DEAD_LETTER.

With `PAYMENT_MYSQL_TEST=true`, the integration suite includes signed callback fixtures sent over HTTP, including simultaneous duplicate callbacks and a late successful payment. These fixtures verify local handling. Run a separate sandbox transaction to verify VNPAY connectivity.

## Outbox delivery

The worker is enabled by default. Set OUTBOX_ENABLED=false to pause delivery, OUTBOX_BATCH_SIZE to cap work per poll, OUTBOX_POLL_DELAY for the polling interval in milliseconds, and OUTBOX_MAX_ATTEMPTS to bound attempts. Retries keep the stored event unchanged and use exponential backoff starting at OUTBOX_RETRY_DELAY, capped at five minutes. A 60-second database lease preserves work across restarts.

The authenticated Payment GET endpoint exposes booking_sync_status and booking_sync_outcome when the payment has an Outbox event. Review REJECTED or DEAD_LETTER records using the reason and event ID before taking operational action.

See [Postman walkthrough](run_tutorial.md) for setup, request bodies, headers and expected responses.
