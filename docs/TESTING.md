# Testing

```bash
npm run test          # every workspace (Turborepo)
npm run test -w @zproo/api
npm run test -w @zproo/web
```

| Workspace             | Runner                                                  | What is covered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api` (platform) | Vitest + Supertest                                      | Health/ready/live (up, degraded, timeout), 404 envelope, malformed/oversized JSON, request-ID propagation, security headers, CORS allow/deny, rate limiting, Swagger on/off and coverage, env validation, error mapping (Zod, Prisma, unknown), `validate()` middleware, log redaction, shared enums = Prisma enums                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `apps/api` (auth)     | Vitest + Supertest, real PostgreSQL + Redis             | OTP sign-up/sign-in, wrong/expired/reused/superseded codes, attempt lockout, resend cooldown, enumeration-safe responses, register conflicts, argon2id storage, password login (phone/email), per-account lockout, suspended accounts, password reset by SMS and email (revokes sessions), refresh rotation, reuse detection revoking the session, logout/logout-all, forged/expired/wrong-audience JWTs, Google/Apple sign-in and account linking, OIDC verification, `/me`, admin RBAC (customer 403, operator 403, support 200, client-claimed roles ignored), Redis rate-limit store                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `apps/api` (flights)  | Vitest + Supertest, real PostgreSQL + Redis             | Search (one way, round trip, connections, validation, unserved routes), offer re-pricing, booking auth + `Idempotency-Key`, concurrent retries with the same key, `PRICE_CHANGED`, `OFFER_EXPIRED`, passenger age bands on the travel date, last-seat race (never oversold), mock payment success/failure/retry, forged signature rejected and audited, payment after hold expiry (refund due recorded), hold expiry releasing seats, PDF e-ticket, 404 for other users, support staff access, fare arithmetic                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `apps/api` (buses)    | Vitest + Supertest, real PostgreSQL + Redis             | Search order, points and prices; Maharashtra route coverage; seat map agrees with the trip; GST on A/C; booking auth and `Idempotency-Key` (incl. concurrent retries); the same seat never sold twice (3 concurrent users); ladies-only seats; price change, unknown point, duplicate seats; payment → PNR → PDF ticket; hold expiry frees seats; access rules; seat pricing; mock providers refused in production                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `apps/web`            | Vitest + Testing Library (jsdom; node for prerendering) | Real route tree: home sections in order, planned pages, admin shell, 404s, quick search; route guards; sign-up/sign-in/reset flows; token refresh; booking widget (default search URL, keyboard airport choice, swap, validation errors, round trip via return date, travellers & cabin, multi-city, bus/hotel/cab/parcel tabs); bus results (filters, sorting), seat map (booked, ladies-only, selection, points), traveller form with ladies-seat rule, review → booking with idempotency key → payment, taken-seat warning, bus confirmation with operator PNR; bus filter/sort helpers; flight results (filters, sorting, invalid search, guest sign-in redirect), traveller form validation, review → booking with idempotency key → payment, price-change acceptance, confirmation with PNR and ticket numbers, filter/sort/format helpers; place filtering; search URL round-trips and date defaults; `TravelImage` photo vs illustration; policy pages; prerendering of every indexable page with no frozen dates |
| `packages/utils`      | Vitest                                                  | Paise arithmetic and INR formatting, booking reference generation, validation and normalisation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `packages/validation` | Vitest                                                  | Mobile number normalisation, email, password, OTP, pagination                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

API tests need **PostgreSQL and Redis** running (`npm run db:up`, or local services). They use a
separate database, `zproo_test`, which is created, migrated and loaded with reference data
automatically (reference data and the flight timetable) before each run (`apps/api/test/globalSetup.ts`), and truncated between tests. The
setup refuses to run against a database whose URL does not contain `test`. Override with
`TEST_DATABASE_URL` / `TEST_REDIS_URL`. Test files run one at a time because they share the database.

External providers are replaced by fakes (`test/helpers.ts`): SMS and email providers record
messages so tests read the real OTP, and a fake identity verifier stands in for Google. The real
OIDC verifier is tested against a local JWKS server with genuinely signed tokens.

## Lighthouse (home page, production build, prerendered)

Measured with Lighthouse 12.8 against `vite preview` (compressed), three runs each, after the
P04 changes (2026-10-06, CI-class container, CPU benchmark ≈ 2,500):

| Profile                            | Performance | Accessibility | Best practices | SEO |
| ---------------------------------- | ----------- | ------------- | -------------- | --- |
| Desktop                            | 99          | 100           | 100            | 100 |
| Mobile (simulated slow 4G, 4× CPU) | 81–83       | 100           | 100            | 100 |

Desktop LCP 0.7 s, TBT 0 ms. Mobile FCP 3.2 s, LCP 3.5 s, TBT 120–210 ms, CLS 0: the remaining
cost is JavaScript execution (React and the router) under CPU throttling. Earlier phases measured
86–90 on mobile on a different machine; simulated scores scale with the host CPU, so compare runs
on the same host. `src/hydration.test.tsx` fails the build if a prerendered page stops hydrating
cleanly (a mismatch makes React re-render the page and logs an error).

## CI

- `.github/workflows/ci.yml` (every pull request): install → format check → lint → typecheck →
  migrate a fresh Postgres → verify the schema matches the migrations → seed → test → build.
- `.github/workflows/e2e.yml` (every pull request): unit/API tests, then the end-to-end stack,
  the Selenium suite on desktop and mobile and the API security suite, uploading HTML reports
  and failure evidence. Make **E2E / Suites** a required check in branch protection.

## End-to-end and security suites (Selenium, Python)

```bash
python3 -m pip install -r tests/requirements.txt   # Python 3.12, Chrome + chromedriver
make e2e                # local Postgres/Redis: migrate, seed, start, wait, run, stop
make e2e-docker         # the same on docker-compose.test.yml
                        # (IMAGE_REGISTRY=mirror.gcr.io/library/ when Docker Hub rate-limits)
scripts/e2e-stack.sh    # start only: API in test mode on :5100, web E2E build on :4300
scripts/e2e-run.sh tests/e2e/test_bus.py -n 4 [--viewport mobile]
```

| File                                  | Cases                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/e2e/test_auth.py`              | AUTH-01…17: login, OTP, sign-up, reset, deep login, open redirects, refresh, reuse, multi-tab logout, rate limit                                                                     |
| `tests/e2e/test_bus.py`               | BUS-01…22: search, filters, sort, seats, ladies seats, happy path + PDF, scenarios, hold expiry, coupons, double pay, cancel                                                         |
| `tests/e2e/test_flight.py`            | FLT-01…16: search, pax rules, filters, fare families (keyboard), re-price, ages, one-way and round trip, scenarios, deep login, session expiry, 390px layout                         |
| `tests/e2e/test_hotel.py`             | HTL-01…16: search rules, filters, sort, lightbox, occupancy, multi-room + voucher, scenarios, XSS, non-refundable cancel, 30 Dec → 2 Jan, deep login                                 |
| `tests/e2e/test_checkout_shared.py`   | CHK-01…07: terms, declined then retried payment, empty checkout, other user's booking, totals, PDF download, saved travellers                                                        |
| `tests/e2e/test_sop_ui.py`            | SOP-01…12 from computed styles: brand red, forbidden reds, font, radii, pills, field errors, toast, titles, theme colour, loading copy, reduced motion, 64px bars                    |
| `tests/e2e/test_a11y.py`              | axe-core (0 serious/critical) on every journey step, keyboard-only bus booking, accessible names, 44px touch targets on phones                                                       |
| `tests/security/test_api_security.py` | SEC-01…18: IDOR, tampering, signatures, webhooks, idempotency, races, JWTs, SQLi, rate limits, CORS, headers, production errors and hooks, enumeration, CSRF, logs, dependency audit |

Rules: `data-testid` locators only, explicit waits only (`time.sleep` fails the run), each test
creates its own user and data through `/api/test/*`, reruns are installed but set to 0. On
failure the screenshot, page source, browser console and last API responses are saved under
`tests/e2e/artifacts/<test>/`. The test clock (`zproo_clock_offset_ms` cookie → `X-Test-Now`) and
supplier scenarios (`zproo_mock_scenario` cookie → `X-Mock-Scenario`) work in test builds only.
SEC-13/14 start the API with production behaviour (`apps/api/test/support/productionServer.ts`)
because production refuses the mock suppliers.
