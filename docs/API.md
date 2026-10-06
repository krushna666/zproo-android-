# API

- Base URL: `/api` (development `http://localhost:5000/api`; the E2E stack uses `:5100`).
- Interactive docs: `/api/docs` (Swagger UI) and `/api/docs/openapi.json`, generated from the
  same Zod schemas the API validates with. On by default outside production (`ENABLE_API_DOCS`).
- JSON only, request bodies up to 100 kB. Every body, query and path is validated with a strict
  schema: unknown keys are a `400 VALIDATION_ERROR`.
- Money is integer **paise** everywhere. Prices and totals are computed on the server; clients
  send IDs, selections and coupon codes, plus the total they were shown (`expectedTotal`) so a
  changed price is caught, never trusted.

## Envelopes

Success:

```json
{ "success": true, "message": "Success", "data": {} }
```

Failure (no stack traces, SQL or supplier payloads, in any environment):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please fix the errors",
    "requestId": "0538849f-36e1-4e3d-ba46-dc6a47022590",
    "details": {
      "fields": { "phone": "Enter a valid 10-digit mobile number" },
      "issues": [{ "path": "body.phone", "message": "Enter a valid 10-digit mobile number" }]
    }
  }
}
```

`requestId` equals the `X-Request-Id` response header and the server log line. Clients may send a
well-formed `X-Request-Id` (8–128 chars of `A-Z a-z 0-9 . _ -`). Errors are always
`Cache-Control: no-store`.

## Error codes

| HTTP | `code`                    | When                                                                       |
| ---- | ------------------------- | -------------------------------------------------------------------------- |
| 400  | `BAD_REQUEST`             | Malformed JSON or request                                                  |
| 400  | `VALIDATION_ERROR`        | Input failed validation (`details.fields` / `details.issues`)              |
| 400  | `INVALID_OTP`             | Wrong code (the message says how many attempts are left)                   |
| 400  | `OTP_EXPIRED`             | Code expired, already used, or too many attempts                           |
| 400  | `PROVIDER_NOT_CONFIGURED` | That social sign-in is not enabled                                         |
| 400  | `PAYMENT_ERROR`           | Payment signature, order or webhook rejected                               |
| 401  | `UNAUTHENTICATED`         | Not signed in; token missing, expired, tampered, wrong `alg`/`aud`/`iss`   |
| 401  | `INVALID_CREDENTIALS`     | Wrong mobile number/email or password                                      |
| 403  | `ACCOUNT_DISABLED`        | Account suspended or deactivated                                           |
| 403  | `FORBIDDEN`               | Signed in but not allowed (another customer's booking, missing CSRF)       |
| 404  | `NOT_FOUND`               | No such route or record (on this account)                                  |
| 409  | `PRICE_CHANGED`           | The price moved; `details.oldTotal`, `details.newTotal`                    |
| 409  | `SEAT_UNAVAILABLE`        | Seats taken meanwhile; `details.seats`                                     |
| 409  | `ROOM_UNAVAILABLE`        | Room sold out meanwhile                                                    |
| 409  | `FARE_UNAVAILABLE`        | Fare or offer no longer sold                                               |
| 409  | `IDEMPOTENCY_CONFLICT`    | Same `Idempotency-Key` with a different body                               |
| 409  | `BOOKING_CLOSED`          | Sales closed for that departure                                            |
| 409  | `INVALID_STATE`           | Action not allowed in the booking's state (e.g. cancel twice)              |
| 409  | `CONFLICT`                | Limit or uniqueness (e.g. 20 saved travellers)                             |
| 410  | `HOLD_EXPIRED`            | The hold ran out before payment                                            |
| 413  | `PAYLOAD_TOO_LARGE`       | Body over 100 kB                                                           |
| 422  | `COUPON_INVALID`          | `details.reason`: `expired`, `not_applicable`, `min_amount`, `usage_limit` |
| 429  | `RATE_LIMITED`            | With `Retry-After` and `details.retryAfter` (seconds)                      |
| 500  | `INTERNAL_ERROR`          | "Something went wrong. Please try again."                                  |
| 500  | `DATABASE_ERROR`          | Database failure (generic message)                                         |
| 502  | `PROVIDER_ERROR`          | Supplier unreachable after retries / circuit open                          |
| 503  | `SERVICE_UNAVAILABLE`     | Dependency down                                                            |

The web app maps codes to the SOP copy (`apps/web/src/lib/apiErrors.ts`).

## Authentication

- **Access token**: JWT HS256 (algorithm pinned; `iss`, `aud`, `exp` checked), 15 minutes
  (`JWT_ACCESS_TTL`), sent as `Authorization: Bearer <token>`. The web app keeps it in memory.
- **Refresh token**: random value in `zp_rt` (`HttpOnly`, `SameSite=Strict`, path `/api/auth`,
  `Secure` in production), 30 days (`REFRESH_TOKEN_TTL_DAYS`). Rotated on every refresh; replaying
  an old one revokes every session of that user.
- **CSRF** on `/auth/refresh` and `/auth/logout`: the browser `Origin` (or `Referer`) must be an
  allowed web origin, and `X-CSRF-Token` must equal the `zp_csrf` cookie (double submit).
- **Development** SMS/email providers return the code as `devCode` (for the in-app hint); their
  console output masks the recipient and redacts the code. They are refused in production.

| Method | Path                      | Auth          | Description                                                                             |
| ------ | ------------------------- | ------------- | --------------------------------------------------------------------------------------- |
| POST   | `/auth/send-otp`          | —             | `{ phone }` → 6-digit code (same answer for new and existing numbers)                   |
| POST   | `/auth/verify-otp`        | —             | `{ phone, otp }` → signed in, or `SIGNUP_REQUIRED` + `signupToken` for a new number     |
| POST   | `/auth/register`          | signup token  | `{ signupToken, fullName, email?, password? }` → 201, signed in                         |
| POST   | `/auth/login`             | —             | `{ identifier, password }` (mobile number or email)                                     |
| POST   | `/auth/social/{provider}` | —             | `google` / `apple` ID token (when its client ID is configured)                          |
| POST   | `/auth/refresh`           | cookie + CSRF | New access token, rotated cookie                                                        |
| POST   | `/auth/logout`            | cookie + CSRF | End this session (idempotent)                                                           |
| POST   | `/auth/logout-all`        | bearer        | End every session                                                                       |
| POST   | `/auth/forgot-password`   | —             | `{ identifier }` → same status, body shape and timing whether or not the account exists |
| POST   | `/auth/reset-password`    | —             | `{ identifier, otp, newPassword }`; signs out all sessions                              |

Sign-in responses are `{ user, accessToken, expiresIn }` and set the cookies.

## Account

| Method | Path                  | Description                                                                                       |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------- |
| GET    | `/me`                 | The signed-in user with roles and permissions                                                     |
| PATCH  | `/me`                 | `{ fullName }`                                                                                    |
| POST   | `/me/password`        | `{ currentPassword, newPassword }`; other devices are signed out                                  |
| GET    | `/me/travellers`      | Saved travellers, newest first (SOP §6.3)                                                         |
| PUT    | `/me/travellers`      | `{ firstName, lastName?, title?, gender?, dob? }`; the same name updates; max 20 (`409 CONFLICT`) |
| DELETE | `/me/travellers/{id}` | Remove one (another account's id is `404`)                                                        |

## Search and inventory (public)

| Method | Path                      | Cache        | Description                                                                             |
| ------ | ------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| GET    | `/buses/cities?q=`        | —            | City suggestions                                                                        |
| GET    | `/buses/search`           | private, 60s | `from`, `to` (city codes), `date` (YYYY-MM-DD, today…+120 days)                         |
| GET    | `/buses/{tripId}`         | —            | Operator, coach, photos, boarding/dropping points, policies                             |
| GET    | `/buses/{tripId}/seats`   | `no-store`   | Seat map with live status and per-seat prices                                           |
| GET    | `/flights/airports?q=`    | —            | Airport suggestions                                                                     |
| GET    | `/flights/search`         | private, 60s | `from`, `to`, `date`, `returnDate?`, `adults`, `children`, `infants`, `cabin`           |
| GET    | `/flights/{offerId}`      | `no-store`   | Live price, fare families, rules; `?reprice=1` re-prices an expired offer (20 min TTL)  |
| GET    | `/hotels/destinations?q=` | —            | Cities, areas and hotels                                                                |
| GET    | `/hotels/search`          | private, 60s | `destinationId`, `checkIn`, `checkOut`, `rooms` (`2-0\|1-1:5`), filters, `sort`, `page` |
| GET    | `/hotels/{hotelId}`       | —            | Gallery, amenities, house rules, policies                                               |
| GET    | `/hotels/{hotelId}/rooms` | `no-store`   | Room types and rates for the stay                                                       |

## Booking (signed in, `Idempotency-Key` header required)

| Method | Path                                         | Description                                                                                                        |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| POST   | `/buses/book`                                | Hold seats (`BOOKING_HOLD_MINUTES`, 15) → `{ bookingRef, status: HELD, holdExpiresAt, serverNow, priceBreakdown }` |
| POST   | `/flights/book`                              | Hold seats (15 min, or the airline's limit if shorter); one or two legs                                            |
| POST   | `/hotels/book`                               | Hold rooms (15 min); one lead guest per room; `specialRequests` stored as plain text                               |
| POST   | `/{buses,flights,hotels}/{reference}/cancel` | Cancel a confirmed booking (owner); refund per policy                                                              |

Same key + same body replays the first response; same key + different body is
`409 IDEMPOTENCY_CONFLICT`. Concurrent holds on the last seat or room: exactly one succeeds.

## Bookings, coupons, payments (signed in)

| Method | Path                                 | Description                                                                                                                                                                    |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/bookings`                          | Your bookings, newest first                                                                                                                                                    |
| GET    | `/bookings/{reference}`              | Details (owner, or staff with `booking:read:any`; others `403`, no data)                                                                                                       |
| GET    | `/bookings/{reference}/ticket.pdf`   | E-ticket / voucher PDF (confirmed bookings), `no-store`                                                                                                                        |
| GET    | `/bookings/{reference}/cancellation` | Refund estimate from the server before cancelling                                                                                                                              |
| POST   | `/coupons/apply`                     | `{ bookingRef, code }` → recomputed price                                                                                                                                      |
| POST   | `/coupons/remove`                    | `{ bookingRef }`                                                                                                                                                               |
| POST   | `/payments/create`                   | `{ bookingRef }` → order for the **booking's** amount (reuses an open order)                                                                                                   |
| POST   | `/payments/verify`                   | `{ bookingRef, orderId, paymentId, signature }`: HMAC-SHA256 checked in constant time, order/amount/currency must match, then the supplier issues and the booking is confirmed |
| POST   | `/payments/fail`                     | `{ orderId, reason }`; the booking stays payable until the hold ends                                                                                                           |
| POST   | `/payments/webhook`                  | Gateway webhook (raw body, `X-Razorpay-Signature`, `X-Razorpay-Event-Id`); each event once; verify and webhook race safely                                                     |
| POST   | `/payments/mock/complete`            | **Mock gateway only** (never in production): returns `success` / `failure` like the real checkout                                                                              |

A capture after the hold expired leaves the booking expired and marks the payment
`REFUND_DUE`. Supplier issue failures are retried by status lookup, then `REFUND_DUE`.

## Admin

Every `/admin/*` route needs `admin:access` plus its own permission.

| Method | Path           | Permission      | Description                                                  |
| ------ | -------------- | --------------- | ------------------------------------------------------------ |
| GET    | `/admin/users` | `user:read:any` | Users; `search`, `role`, `status`, `page`, `limit` (max 100) |

## System

| Method | Path            | Description                                             |
| ------ | --------------- | ------------------------------------------------------- |
| GET    | `/health`       | Version, uptime, database and Redis status (always 200) |
| GET    | `/health/ready` | 200 when every dependency is up, else 503 (readiness)   |
| GET    | `/health/live`  | 200 while the process serves requests (liveness)        |

## Test hooks (`NODE_ENV=test` only)

Never mounted otherwise, and the server refuses to start if they would be (`assertTestEnvironment`).

| Method / header                 | Description                                                                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /test/users`              | Create a signed-in user → `{ user, phone, password, accessToken, refreshToken }`                                                                                      |
| `POST /test/reset`              | Truncate customer data and rate-limit keys                                                                                                                            |
| `POST /test/jobs/release-holds` | Run the hold-release job now                                                                                                                                          |
| `X-Test-Now: <ISO time>`        | The server clock for this request (hold expiry, "today")                                                                                                              |
| `X-Mock-Scenario: <name>`       | Forced supplier behaviour: `provider_down`, `slow`, `no_results`, `price_changed`, `seat_taken`, `room_sold_out`, `fare_unavailable`, `issue_pending`, `issue_failed` |
| `ALLOW_TEST_OTP=true`           | Every OTP is `123456` (refused in production)                                                                                                                         |

## Rate limits

Shared across instances through Redis (allowed through if Redis is down; per-code attempt limits
in PostgreSQL still apply). Every 429 carries `Retry-After`.

| Scope                          | Limit                              | Key            |
| ------------------------------ | ---------------------------------- | -------------- |
| All `/api` routes              | 300 / minute (`RATE_LIMIT_MAX`)    | IP             |
| `/auth/*`                      | 60 / 10 min (`AUTH_IP_RATE_LIMIT`) | IP             |
| Sending a code                 | 1 / 30 s and 5 / hour              | phone or email |
| Sending codes from one address | 20 / hour (`OTP_IP_RATE_LIMIT`)    | IP             |
| Verifying a code               | 20 / 15 min, 5 tries per code      | phone or email |
| Password login                 | 10 / 15 min                        | account        |
| Searches                       | 60 / minute (`SEARCH_RATE_LIMIT`)  | IP             |
| Bookings, payments             | 10 / minute each                   | user           |

`TRUST_PROXY` sets how many proxy hops are trusted for the client IP.

## Conventions

- Pagination: `?page=1&limit=20` (max 100) → `data: { items, page, limit, total }`.
- Dates are IST calendar dates (`YYYY-MM-DD`); timestamps are ISO 8601 UTC. Responses that drive
  countdowns include `serverNow`.
- Security headers on every response: CSP, HSTS, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, COOP/CORP; no `X-Powered-By`. CORS allows only `CORS_ORIGINS`.
