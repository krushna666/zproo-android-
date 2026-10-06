from __future__ import annotations

from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC

from .base import Page, tid

TEST_OTP = "123456"


class LoginPage(Page):
    path = "/login"

    def wait_loaded(self):
        self.visible("auth-submit")
        return self

    def use(self, method: str):
        self.click(f"auth-method-{method}")
        self.w.until(lambda d: self.attr(f"auth-method-{method}", "aria-checked") == "true")
        return self

    def login_email(self, email: str, password: str):
        self.use("email")
        self.type("auth-email", email)
        self.type("auth-password", password)
        self.click("auth-submit")
        return self

    def request_otp(self, phone: str):
        self.use("mobile")
        self.type("auth-mobile", phone)
        self.click("auth-submit")
        self.wait_url("/verify-otp")
        return OtpPage(self.d).wait_loaded()


class OtpPage(Page):
    path = "/verify-otp"

    def wait_loaded(self):
        self.el("auth-otp")
        return self

    def enter(self, code: str):
        el = self.el("auth-otp")
        self.d.execute_script("arguments[0].focus()", el)
        # Keyboard clearing, so the controlled input sees every change.
        el.send_keys(Keys.END)
        for _ in range(len(el.get_attribute("value") or "")):
            el.send_keys(Keys.BACKSPACE)
        el.send_keys(code)
        return self

    def submit(self):
        if self.exists("auth-submit") and self.el("auth-submit").is_enabled():
            self.click("auth-submit")
        return self

    def verify(self, code: str = TEST_OTP):
        """Six digits submit on their own (the code field completes the form)."""
        return self.enter(code)

    def complete_signup(self, name: str = "Amit Sharma"):
        self.type("auth-name", name)
        self.click("auth-submit")
        return self


class ForgotPasswordPage(Page):
    path = "/forgot-password"

    def request(self, identifier: str):
        self.type("auth-email", identifier)
        self.click("auth-submit")
        return self


class ResetPasswordPage(Page):
    path = "/reset-password"

    def reset(self, code: str, password: str):
        el = self.el("auth-otp")
        el.send_keys(code)
        self.type("auth-password", password)
        if self.exists("auth-password-confirm"):
            self.type("auth-password-confirm", password)
        self.click("auth-submit")
        return self


class Header(Page):
    def signed_in_name(self, timeout: float = 15) -> str:
        return self.w.until(EC.presence_of_element_located(tid("header-user"))).text.strip()
