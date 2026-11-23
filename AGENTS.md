# Repository Guidelines

## Project Structure

PawStay runs four services through Docker Compose. Under `Backend/`, Auth, Pet, and Booking use Node.js, Express, and MongoDB. Their application code lives in `src/` and tests in `test/`. Payment uses Java 21, Spring Boot, and MySQL, with code in `src/main/` and tests in `src/test/java/` under `Backend/payment-service/`. Pet and Booking keep their API contracts in `openapi.json`. Gateway routes live in `gateway/default.conf`, and setup and integration notes live in `README.md` and `docs/`.

## Build and Development

- Follow `README.md` to configure local environment files. Docker Compose initializes Auth keys and seed data at startup.
- From the repository root, run `docker compose config --quiet` to validate Compose, then `docker compose up -d --build --wait` to build and start the stack. Check `http://localhost:8080/healthz`.
- For standalone Node development, run `npm ci` and `npm start` from the relevant service directory. Run `mvn verify` from `Backend/payment-service/` to build and test Payment.

## Coding Style

Use two-space indentation for JavaScript and YAML and four spaces for Java. Follow neighboring code for quote style. Keep CommonJS in Node services, camelCase for methods and variables, and PascalCase for Java types. Preserve existing API field names such as `booking_id` and update the relevant OpenAPI file when changing a documented contract.

## Testing

Run `npm test` in each affected Node service. Node uses the built-in test runner with `*.test.js` files. Payment uses JUnit with `*Tests.java` classes. The Booking integration command, `npm run test:integration`, requires the currently missing `scripts/test-support` helper. For gateway or payment changes, verify the HTTP flow, idempotency, and Outbox delivery after Booking restarts. Use test credentials and a separate database for integration runs.

## Commits and Pull Requests

Follow the history’s short, imperative subjects, such as `feat: add booking availability` or `update(docker): add gateway health check`. Describe the behavior change and test results in the PR, link related issues where applicable, and call out configuration or callback URL changes. Keep real `.env` files, private JWT keys, and VNPAY credentials out of commits.
