from __future__ import annotations

from .base import Page


class ReviewPage(Page):
    def wait_loaded(self):
        self.visible("checkout-hold-timer")
        return self

    def apply_coupon(self, code: str):
        self.type("checkout-coupon-input", code)
        self.click("checkout-coupon-apply")
        return self

    def total(self) -> str:
        return self.text("checkout-total")

    def accept_and_proceed(self):
        self.click("checkout-terms")
        self.w.until(lambda d: self.el("checkout-terms").is_selected())
        self.click("checkout-proceed")
        return self


class PaymentPage(Page):
    def wait_loaded(self):
        self.w.until(lambda d: self.exists("checkout-pay-submit") or self.exists("checkout-hold-expired"))
        return self

    def pay(self, method: str = "upi"):
        self.click(f"checkout-pay-method-{method}")
        self.w.until(lambda d: self.el("checkout-pay-submit").is_enabled())
        self.click("checkout-pay-submit")
        return self


class ConfirmationPage(Page):
    def wait_confirmed(self, timeout: float = 30):
        Page(self.d, timeout).w.until(
            lambda d: Page(d).exists("confirm-pnr")
            and (Page(d).el("confirm-pnr").text.strip().strip("·") != ""))
        return self

    def reference(self) -> str:
        return self.text("confirm-booking-ref")

    def pnr(self) -> str:
        return self.text("confirm-pnr")


class BookingsPage(Page):
    path = "/bookings"

    def tab(self, name: str):
        self.click(f"bookings-tab-{name}")
        return self

    def status_of(self, ref: str) -> str:
        return self.attr(f"booking-{ref}", "data-status") or ""
