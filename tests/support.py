"""Shared helpers for the end-to-end and security suites: settings, the API client, dates."""
from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import requests

WEB_URL = os.environ.get("E2E_WEB_URL", "http://localhost:4300").rstrip("/")
API_URL = os.environ.get("E2E_API_URL", "http://localhost:5100").rstrip("/") + "/api"
IST = timezone(timedelta(hours=5, minutes=30))
CSRF = "e2e-csrf-token-0123456789abcdef"


def today_ist() -> datetime:
    return datetime.now(IST)


def ist_date(days: int) -> str:
    """An IST calendar date `days` from today (YYYY-MM-DD)."""
    return (today_ist() + timedelta(days=days)).strftime("%Y-%m-%d")


def unique_phone() -> str:
    return "9" + str(uuid.uuid4().int)[:9]


def client_ip() -> str:
    """A fresh client address per test (the API trusts one proxy hop), so per-IP limits never
    leak between tests that call the API directly."""
    n = uuid.uuid4().int
    return f"10.{n % 250 + 1}.{(n >> 8) % 250 + 1}.{(n >> 16) % 250 + 1}"


@dataclass
class TestUser:
    id: str
    phone: str
    email: str | None
    password: str | None
    access_token: str
    refresh_token: str


class Api:
    """Direct API access for setup and security tests (each instance has its own client IP)."""

    def __init__(self, token: str | None = None, ip: str | None = None):
        self.s = requests.Session()
        self.s.headers["X-Forwarded-For"] = ip or client_ip()
        if token:
            self.s.headers["Authorization"] = f"Bearer {token}"
        self.last: list[str] = []

    def _record(self, r: requests.Response) -> requests.Response:
        self.last = (self.last + [f"{r.request.method} {r.url} -> {r.status_code} {r.text[:2000]}"])[-10:]
        return r

    def get(self, path: str, **kw) -> requests.Response:
        return self._record(self.s.get(API_URL + path, timeout=30, **kw))

    def post(self, path: str, json: object | None = None, **kw) -> requests.Response:
        return self._record(self.s.post(API_URL + path, json=json, timeout=30, **kw))

    def book(self, path: str, body: dict, key: str | None = None, **kw) -> requests.Response:
        headers = {"Idempotency-Key": key or str(uuid.uuid4()), **kw.pop("headers", {})}
        return self.post(path, body, headers=headers, **kw)

    @staticmethod
    def create_user(**fields) -> TestUser:
        r = requests.post(f"{API_URL}/test/users", json=fields, timeout=30,
                          headers={"X-Forwarded-For": client_ip()})
        r.raise_for_status()
        d = r.json()["data"]
        return TestUser(
            id=d["user"]["id"],
            phone=d["phone"],
            email=d["user"].get("email"),
            password=d.get("password"),
            access_token=d["accessToken"],
            refresh_token=d["refreshToken"],
        )

    @classmethod
    def as_user(cls, user: TestUser) -> "Api":
        return cls(token=user.access_token)

    def pay(self, ref: str, outcome: str = "success") -> requests.Response:
        """Order → mock gateway → verify, as the payment page does (the gateway's answer on failure)."""
        order = self.book("/payments/create", {"bookingRef": ref}).json()["data"]
        gateway = self.post("/payments/mock/complete", {"orderId": order["orderId"], "outcome": outcome})
        if outcome != "success":
            return gateway
        g = gateway.json()["data"]
        return self.book("/payments/verify", {
            "bookingRef": ref, "orderId": g["orderId"], "paymentId": g["paymentId"], "signature": g["signature"],
        })
