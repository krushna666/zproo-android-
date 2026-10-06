"""SEC-01…18: API security (Prompt 04 §4.7), requests only, against the E2E stack (NODE_ENV=test)
and, for SEC-13/14, the same API with production behaviour (conftest.production_api)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import shutil
import statistics
import subprocess
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
import requests

from tests.e2e.flows import api_book_bus
from tests.e2e.pages.bus import find_bus_trip
from tests.e2e.pages.hotel import find_rate
from tests.support import API_URL, CSRF, WEB_URL, Api, client_ip

pytestmark = pytest.mark.security

ROOT = Path(__file__).resolve().parents[2]
# The E2E stack's secrets (scripts/e2e-stack.sh): the mock gateway derives its keys from JWT_SECRET.
JWT_SECRET = os.environ.get("E2E_JWT_SECRET", "e2e-access-secret-0123456789abcdef")
API_LOG = Path(os.environ.get("E2E_API_LOG", ROOT / "tests" / "e2e" / ".run" / "api.log"))


def hmac_hex(key: str | bytes, value: str | bytes) -> str:
    key = key.encode() if isinstance(key, str) else key
    value = value.encode() if isinstance(value, str) else value
    return hmac.new(key, value, hashlib.sha256).hexdigest()


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def jwt(payload: dict, secret: str = JWT_SECRET, alg: str = "HS256") -> str:
    header = b64url(json.dumps({"alg": alg, "typ": "JWT"}).encode())
    body = b64url(json.dumps(payload).encode())
    if alg == "none":
        return f"{header}.{body}."
    sig = hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    return f"{header}.{body}.{b64url(sig)}"


def claims(token: str) -> dict:
    part = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))


def held_bus_booking(api: Api, days: int, seats: int = 1) -> tuple[str, int]:
    trip = find_bus_trip(seats=seats, days=days)
    data = api_book_bus(api, trip, trip.seats[:seats])
    return data["bookingRef"], sum(trip.seat_prices[s] for s in trip.seats[:seats])


def no_body_data(r: requests.Response) -> bool:
    return "data" not in r.json() if r.headers.get("content-type", "").startswith("application/json") else True


# ───────────────────────────── Authorization ─────────────────────────────

def test_SEC_01_idor(user_api, other_api):
    ref, _ = held_bus_booking(user_api, days=100)
    assert user_api.pay(ref).status_code == 200
    for path in (f"/bookings/{ref}", f"/bookings/{ref}/ticket.pdf", f"/bookings/{ref}/cancellation"):
        r = other_api.get(path)
        assert r.status_code == 403, (path, r.status_code)
        assert ref not in r.text and no_body_data(r)
    r = other_api.book("/payments/create", {"bookingRef": ref})
    assert r.status_code == 403 and no_body_data(r)
    r = other_api.book(f"/buses/{ref}/cancel", {})
    assert r.status_code == 403


# ───────────────────────────── Prices and payments ─────────────────────────────

def test_SEC_02_tampered_booking(user_api):
    trip = find_bus_trip(days=101)
    seat = trip.seats[0]
    base = {
        "tripId": trip.trip_id, "seats": [seat],
        "boardingPointId": trip.boarding, "droppingPointId": trip.dropping,
        "travellers": [{"seatNo": seat, "name": "Ravi Kumar", "age": 40, "gender": "MALE"}],
        "contact": {"email": "ravi@example.com", "mobile": "9876500000"},
        "expectedTotal": trip.seat_prices[seat],
    }
    for extra in ({"price": 1}, {"totalAmountPaise": 100}, {"discount": 99999}):
        r = user_api.book("/buses/book", {**base, **extra})
        assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION_ERROR", extra
    nested = {**base, "travellers": [{**base["travellers"][0], "fare": 1}]}
    assert user_api.book("/buses/book", nested).json()["error"]["code"] == "VALIDATION_ERROR"
    # A low expected total is not a discount: the server's price stands.
    r = user_api.book("/buses/book", {**base, "expectedTotal": 100})
    assert r.status_code == 409 and r.json()["error"]["code"] == "PRICE_CHANGED"
    server_total = r.json()["error"]["details"]["newTotal"]
    ok = user_api.book("/buses/book", {**base, "expectedTotal": server_total})
    assert ok.status_code == 201
    ref = ok.json()["data"]["bookingRef"]
    order = user_api.book("/payments/create", {"bookingRef": ref}).json()["data"]
    booking = user_api.get(f"/bookings/{ref}").json()["data"]
    assert order["amount"] == booking["price"]["totalPaise"] == server_total


def test_SEC_03_forged_signature(user_api):
    ref, _ = held_bus_booking(user_api, days=102)
    order = user_api.book("/payments/create", {"bookingRef": ref}).json()["data"]
    gateway = user_api.post("/payments/mock/complete", {"orderId": order["orderId"], "outcome": "success"}).json()["data"]
    for signature in ("0" * 64, hmac_hex("guess", f"{order['orderId']}|{gateway['paymentId']}"), "not-hex"):
        r = user_api.book("/payments/verify", {"bookingRef": ref, "orderId": order["orderId"],
                                                "paymentId": gateway["paymentId"], "signature": signature})
        assert r.status_code in (400, 401), r.text
    assert user_api.get(f"/bookings/{ref}").json()["data"]["status"] != "CONFIRMED"


def webhook(body: dict, event_id: str, secret: str | None = None) -> requests.Response:
    raw = json.dumps(body).encode()
    key = secret if secret is not None else hmac_hex(JWT_SECRET, "zproo-go:mock-webhooks:v1")
    return requests.post(f"{API_URL}/payments/webhook", data=raw, timeout=15, headers={
        "Content-Type": "application/json", "X-Razorpay-Signature": hmac_hex(key, raw),
        "X-Razorpay-Event-Id": event_id, "X-Forwarded-For": client_ip()})


def test_SEC_04_webhook_signature_and_replay(user_api):
    ref, _ = held_bus_booking(user_api, days=103)
    order = user_api.book("/payments/create", {"bookingRef": ref}).json()["data"]
    gateway = user_api.post("/payments/mock/complete", {"orderId": order["orderId"], "outcome": "success"}).json()["data"]
    body = {"event": "payment.captured", "payload": {"payment": {"entity": {
        "id": gateway["paymentId"], "order_id": order["orderId"], "amount": order["amount"],
        "currency": "INR", "status": "captured"}}}}
    event_id = f"evt_{uuid.uuid4().hex[:16]}"
    bad = webhook(body, event_id, secret="not-the-webhook-secret")
    assert bad.status_code in (400, 401)
    assert user_api.get(f"/bookings/{ref}").json()["data"]["status"] != "CONFIRMED"
    first = webhook(body, event_id)
    assert first.status_code == 200, first.text
    assert user_api.get(f"/bookings/{ref}").json()["data"]["status"] == "CONFIRMED"
    replay = webhook(body, event_id)
    assert replay.status_code == 200 and "duplicate" in replay.text
    events = [e for e in user_api.get(f"/bookings/{ref}").json()["data"].get("events", [])
              if e.get("type") == "CONFIRMED"]
    assert len(events) <= 1


def test_SEC_05_verify_with_another_orders_payment(user_api):
    ref_a, _ = held_bus_booking(user_api, days=104)
    ref_b, _ = held_bus_booking(user_api, days=105, seats=2)
    order_a = user_api.book("/payments/create", {"bookingRef": ref_a}).json()["data"]
    user_api.book("/payments/create", {"bookingRef": ref_b})
    paid_a = user_api.post("/payments/mock/complete", {"orderId": order_a["orderId"], "outcome": "success"}).json()["data"]
    # Booking B "paid" with A's (smaller) order and its genuine signature.
    r = user_api.book("/payments/verify", {"bookingRef": ref_b, "orderId": paid_a["orderId"],
                                           "paymentId": paid_a["paymentId"], "signature": paid_a["signature"]})
    assert r.status_code in (400, 409, 422), r.text
    assert user_api.get(f"/bookings/{ref_b}").json()["data"]["status"] != "CONFIRMED"


def test_SEC_06_idempotency_conflict(user_api):
    trip = find_bus_trip(seats=2, days=106)
    key = str(uuid.uuid4())
    body = {
        "tripId": trip.trip_id, "seats": trip.seats[:1],
        "boardingPointId": trip.boarding, "droppingPointId": trip.dropping,
        "travellers": [{"seatNo": trip.seats[0], "name": "Ravi Kumar", "age": 40, "gender": "MALE"}],
        "contact": {"email": "ravi@example.com", "mobile": "9876500000"},
        "expectedTotal": trip.seat_prices[trip.seats[0]],
    }
    first = user_api.book("/buses/book", body, key=key)
    assert first.status_code == 201
    again = user_api.book("/buses/book", body, key=key)
    assert again.status_code == 201 and again.json()["data"]["bookingRef"] == first.json()["data"]["bookingRef"]
    changed = {**body, "contact": {"email": "other@example.com", "mobile": "9876500000"}}
    r = user_api.book("/buses/book", changed, key=key)
    assert r.status_code == 409 and r.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"


def test_SEC_07_parallel_holds_on_last_seat_and_room():
    trip = find_bus_trip(days=107)
    seat = trip.seats[0]
    apis = [Api.as_user(u) for u in ThreadPoolExecutor(10).map(lambda _: Api.create_user(), range(50))]
    body = {
        "tripId": trip.trip_id, "seats": [seat],
        "boardingPointId": trip.boarding, "droppingPointId": trip.dropping,
        "travellers": [{"seatNo": seat, "name": "Ravi Kumar", "age": 40, "gender": "MALE"}],
        "contact": {"email": "ravi@example.com", "mobile": "9876500000"},
        "expectedTotal": trip.seat_prices[seat],
    }
    with ThreadPoolExecutor(50) as pool:
        codes = list(pool.map(lambda a: a.book("/buses/book", body).status_code, apis))
    assert codes.count(201) == 1, codes
    assert set(codes) <= {201, 409}, codes

    stay, (rate,) = find_rate("htl_GOI008", 108, rooms="2-0")
    rooms_left = next(r["roomsLeft"] for rt in Api().get(f"/hotels/{stay.hotel_id}/rooms", params={
        "checkIn": stay.check_in, "checkOut": stay.check_out, "rooms": "2-0"}).json()["data"]["roomTypes"]
        for r in rt["rates"] if r["rateId"] == rate)
    assert rooms_left == 1
    hotel = {
        "hotelId": stay.hotel_id, "checkIn": stay.check_in, "checkOut": stay.check_out,
        "rooms": [{"roomTypeId": rate.replace("rate_", "rt_").rsplit("_", 1)[0], "rateId": rate,
                   "adults": 2, "childAges": [],
                   "leadGuest": {"title": "MR", "firstName": "Ravi", "lastName": "Kumar"}}],
        "contact": {"email": "ravi@example.com", "mobile": "9876500000"}, "expectedTotal": 0,
    }
    total = apis[0].book("/hotels/book", hotel).json()["error"]["details"]["newTotal"]
    hotel["expectedTotal"] = total
    with ThreadPoolExecutor(50) as pool:
        codes = list(pool.map(lambda a: a.book("/hotels/book", hotel).status_code, apis))
    assert codes.count(201) == 1, codes
    assert set(codes) <= {201, 409}, codes


# ───────────────────────────── Tokens ─────────────────────────────

def test_SEC_08_bad_tokens(user):
    good = claims(user.access_token)
    now = int(time.time())
    tokens = {
        "alg none": jwt({**good}, alg="none"),
        "expired": jwt({**good, "iat": now - 7200, "exp": now - 3600}),
        "wrong aud": jwt({**good, "aud": "someone-else"}),
        "wrong iss": jwt({**good, "iss": "evil"}),
        "wrong key": jwt({**good}, secret="not-the-server-secret-0123456789"),
        "tampered": user.access_token.rsplit(".", 2)[0] + "." + b64url(json.dumps(
            {**good, "roles": ["SUPER_ADMIN"]}).encode()) + "." + user.access_token.rsplit(".", 1)[1],
        "garbage": "not.a.token",
    }
    # Control: a correctly signed copy works, so the rejections are about the defect.
    assert Api(token=jwt({**good})).get("/me").status_code == 200
    for name, token in tokens.items():
        r = Api(token=token).get("/me")
        assert r.status_code == 401, name
        assert r.json()["error"]["code"] == "UNAUTHENTICATED", name


# ───────────────────────────── Input ─────────────────────────────

@pytest.mark.parametrize("path,params", [
    ("/buses/search", {"from": "' OR 1=1--", "to": "BOM", "date": "2026-12-01"}),
    ("/buses/search", {"from": "PNQ", "to": "BOM", "date": "2026-12-01' OR '1'='1"}),
    ("/flights/search", {"from": "PNQ", "to": "DEL'; DROP TABLE bookings;--", "date": "2026-12-01",
                         "adults": 1, "children": 0, "infants": 0, "cabin": "ECONOMY"}),
    ("/hotels/search", {"destinationId": "city_GOI' OR 1=1--", "checkIn": "2026-12-01",
                        "checkOut": "2026-12-03", "rooms": "2-0"}),
    ("/buses/cities", {"q": "' UNION SELECT password FROM users--"}),
    ("/flights/airports", {"q": "%' OR '1'='1"}),
])
def test_SEC_09_sql_injection(path, params):
    r = Api().get(path, params=params)
    assert r.status_code in (200, 400), r.text
    assert r.status_code != 500
    if r.status_code == 200:
        assert r.json()["data"] in ([], {}) or "password" not in r.text.lower()


# ───────────────────────────── Rate limits ─────────────────────────────

def test_SEC_10_rate_limits(user):
    api = Api()
    mobile = user.phone[3:]
    for _ in range(10):
        api.post("/auth/login", {"identifier": mobile, "password": "wrong-password"})
    r = api.post("/auth/login", {"identifier": mobile, "password": "wrong-password"})
    assert r.status_code == 429 and r.headers.get("Retry-After"), r.text
    assert r.json()["error"]["code"] == "RATE_LIMITED"

    phone = Api.create_user().phone[3:]
    first = api.post("/auth/send-otp", {"phone": phone})
    assert first.status_code == 200
    again = api.post("/auth/send-otp", {"phone": phone})
    assert again.status_code == 429 and again.headers.get("Retry-After")

    searcher = Api()
    params = {"from": "PNQ", "to": "BOM", "date": time.strftime("%Y-%m-%d", time.gmtime(time.time() + 9 * 86400))}
    limit = int(os.environ.get("E2E_SEARCH_RATE_LIMIT", "600"))
    with ThreadPoolExecutor(20) as pool:
        codes = list(pool.map(lambda _: searcher.s.get(f"{API_URL}/buses/search", params=params, timeout=30),
                              range(limit + 5)))
    limited = [r for r in codes if r.status_code == 429]
    assert limited and limited[0].headers.get("Retry-After")


# ───────────────────────────── HTTP hardening ─────────────────────────────

def test_SEC_11_cors_unknown_origin():
    evil = requests.options(f"{API_URL}/buses/cities?q=pun", timeout=10, headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "Access-Control-Allow-Origin" not in evil.headers
    get = requests.get(f"{API_URL}/buses/cities?q=pun", timeout=10, headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in get.headers
    ours = requests.get(f"{API_URL}/buses/cities?q=pun", timeout=10, headers={"Origin": WEB_URL})
    assert ours.headers.get("Access-Control-Allow-Origin") == WEB_URL


def test_SEC_12_security_headers():
    r = requests.get(f"{API_URL}/health", timeout=10)
    h = {k.lower(): v for k, v in r.headers.items()}
    assert "default-src" in h.get("content-security-policy", "")
    assert h.get("x-content-type-options") == "nosniff"
    assert h.get("referrer-policy")
    assert "max-age=" in h.get("strict-transport-security", "")
    assert "x-powered-by" not in h


def test_SEC_13_production_errors_leak_nothing(production_api):
    s = requests.Session()
    checks = [
        s.post(f"{production_api}/auth/login", data="{bad json", headers={"Content-Type": "application/json"}),
        s.get(f"{production_api}/buses/search", params={"from": "' OR 1=1--"}),
        s.get(f"{production_api}/bookings/ZB0000000000", headers={"Authorization": "Bearer x.y.z"}),
        s.get(f"{production_api}/no-such-route"),
        s.get(f"{production_api}/hotels/htl_XXX999/rooms", params={"checkIn": "2026-13-45"}),
    ]
    for r in checks:
        text = r.text
        assert r.status_code < 500 or r.json()["error"]["message"] == "Something went wrong. Please try again."
        for leak in ("stack", "    at ", "node_modules", "prisma", "SELECT ", "Error:", "/home/", "ZodError"):
            assert leak not in text, (r.url, leak, text[:300])


def test_SEC_14_test_hooks_off_in_production(production_api):
    assert requests.post(f"{production_api}/test/users", json={}, timeout=10).status_code == 404
    assert requests.post(f"{production_api}/test/reset", timeout=10).status_code == 404
    date = time.strftime("%Y-%m-%d", time.gmtime(time.time() + 12 * 86400))
    for scenario in ("provider_down", "no_results"):
        r = requests.get(f"{production_api}/buses/search", params={"from": "PNQ", "to": "BOM", "date": date},
                         headers={"X-Mock-Scenario": scenario, "X-Test-Now": "2030-01-01T00:00:00Z"}, timeout=30)
        assert r.status_code == 200 and r.json()["data"]["trips"], scenario


# ───────────────────────────── Auth flows ─────────────────────────────

def test_SEC_15_forgot_password_no_enumeration():
    known = [Api.create_user(email=f"known.{uuid.uuid4().hex[:8]}@example.com") for _ in range(5)]
    # Same first letter, so the masked address echoed in the message (k***@…) matches too.
    unknown = [f"known.{uuid.uuid4().hex[:8]}@example.com" for _ in range(5)]

    def ask(email: str) -> tuple[float, int, dict]:
        start = time.perf_counter()
        r = Api().post("/auth/forgot-password", {"identifier": email})
        body = r.json()
        body.get("error", {}).pop("requestId", None)
        body.pop("requestId", None)
        return time.perf_counter() - start, r.status_code, body

    a = [ask(u.email) for u in known]
    b = [ask(e) for e in unknown]
    assert {s for _, s, _ in a} == {s for _, s, _ in b} == {200}
    assert all(body == a[0][2] for _, _, body in a + b)
    gap_ms = abs(statistics.median(t for t, _, _ in a) - statistics.median(t for t, _, _ in b)) * 1000
    assert gap_ms <= 150, gap_ms


def test_SEC_16_refresh_needs_csrf_and_origin(user):
    cookies = f"zp_rt={user.refresh_token}; zp_csrf={CSRF}"
    no_header = requests.post(f"{API_URL}/auth/refresh", timeout=10,
                              headers={"Cookie": cookies, "Origin": WEB_URL})
    assert no_header.status_code == 403
    wrong_origin = requests.post(f"{API_URL}/auth/refresh", timeout=10, headers={
        "Cookie": cookies, "X-CSRF-Token": CSRF, "Origin": "https://evil.example"})
    assert wrong_origin.status_code == 403
    mismatch = requests.post(f"{API_URL}/auth/refresh", timeout=10, headers={
        "Cookie": cookies, "X-CSRF-Token": "x" * len(CSRF), "Origin": WEB_URL})
    assert mismatch.status_code == 403
    ok = requests.post(f"{API_URL}/auth/refresh", timeout=10, headers={
        "Cookie": cookies, "X-CSRF-Token": CSRF, "Origin": WEB_URL})
    assert ok.status_code == 200


def test_SEC_17_logs_hold_no_secrets():
    if not API_LOG.exists():
        pytest.fail(f"API log not found at {API_LOG} (set E2E_API_LOG)")
    marker = API_LOG.stat().st_size
    user = Api.create_user(email=f"logs.{uuid.uuid4().hex[:8]}@example.com", password="Secret#2026pass")
    api = Api()
    api.post("/auth/login", {"identifier": user.email, "password": "Secret#2026pass"})
    api.post("/auth/login", {"identifier": user.email, "password": "Wrong#2026pass"})
    api.post("/auth/send-otp", {"phone": user.phone[3:]})
    api.post("/auth/verify-otp", {"phone": user.phone[3:], "otp": "123456"})
    Api.as_user(user).get("/me")
    requests.post(f"{API_URL}/auth/refresh", timeout=10, headers={
        "Cookie": f"zp_rt={user.refresh_token}; zp_csrf={CSRF}", "X-CSRF-Token": CSRF, "Origin": WEB_URL})
    with API_LOG.open("rb") as f:
        f.seek(marker)
        captured = f.read().decode("utf-8", "replace")
    assert "/auth/verify-otp" in captured  # the requests above were logged
    for secret in ("Secret#2026pass", "Wrong#2026pass", user.access_token, user.refresh_token,
                   user.phone[3:], user.phone, '"otp":"123456"', "123456\""):
        assert secret not in captured, secret


def test_SEC_18_dependency_audit():
    npm = subprocess.run([shutil.which("npm") or "npm", "audit", "--omit=dev", "--audit-level=high", "--json"],
                         cwd=ROOT, capture_output=True, text=True, timeout=300)
    report = json.loads(npm.stdout or "{}")
    vulns = report.get("metadata", {}).get("vulnerabilities", {})
    assert "error" not in report, report.get("error")
    assert vulns.get("high", 0) == 0 and vulns.get("critical", 0) == 0, vulns
    pip = subprocess.run([os.environ.get("E2E_PYTHON", "python3"), "-m", "pip_audit", "-r",
                          str(ROOT / "tests" / "requirements.txt"), "--format", "json", "--progress-spinner", "off"],
                         capture_output=True, text=True, timeout=600)
    deps = json.loads(pip.stdout or "{}").get("dependencies", [])
    found = [(d["name"], v["id"]) for d in deps for v in d.get("vulns", [])]
    assert pip.returncode in (0, 1) and deps, pip.stderr[-500:]
    assert not found, found
