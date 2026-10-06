"""AUTH-01…17: sign-in methods, OTP rules, password reset and deep login (Prompt 04 §4.1)."""
from __future__ import annotations

import json
import re
from urllib.parse import quote

import pytest
import requests
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

from tests.e2e.conftest import set_clock, sign_in
from tests.e2e.pages.auth import ForgotPasswordPage, LoginPage, OtpPage, ResetPasswordPage
from tests.e2e.pages.base import Page
from tests.e2e.pages.bus import BusSeatsPage, find_bus_trip
from tests.support import API_URL, CSRF, WEB_URL, Api, unique_phone

pytestmark = pytest.mark.auth


def session_state(driver) -> str:
    page = Page(driver)
    page.w.until(lambda d: page.attr("site-header", "data-session") != "loading")
    return page.attr("site-header", "data-session") or ""


def wait_signed_in(driver) -> None:
    page = Page(driver)
    page.w.until(lambda d: page.attr("site-header", "data-session") == "authenticated")


def wait_signed_out(driver, timeout: float = 15) -> None:
    page = Page(driver, timeout)
    page.w.until(lambda d: page.attr("site-header", "data-session") == "anonymous")


@pytest.mark.smoke
def test_AUTH_01_email_login(driver, user):
    login = LoginPage(driver).open().wait_loaded()
    login.login_email(user.email, "secret123")
    assert login.toast("success") == "Login successful!"
    wait_signed_in(driver)
    assert login.path_and_query == "/"


def test_AUTH_02_wrong_password(driver, user):
    login = LoginPage(driver).open().wait_loaded()
    login.login_email(user.email, "wrongpass1")
    assert login.field_error("password") == "Incorrect mobile number, email or password"
    assert login.attr("auth-password", "aria-invalid") == "true"
    assert login.path_and_query.startswith("/login")


def test_AUTH_03_empty_submit(driver):
    login = LoginPage(driver).open().wait_loaded().use("email")
    login.click("auth-submit")
    assert login.toast("error") == "Please fix the errors"
    assert login.field_error("identifier") == "Enter your mobile number or email"
    assert login.field_error("password") == "Password is required"
    assert login.attr("auth-email", "aria-invalid") == "true"
    assert driver.switch_to.active_element.get_attribute("data-testid") == "auth-email"


@pytest.mark.smoke
def test_AUTH_04_mobile_otp_login(driver, user):
    otp = LoginPage(driver).open().wait_loaded().request_otp(user.phone[3:])
    assert re.fullmatch(r"OTP sent to \+91 \S+", otp.toast("success"))
    otp.verify()
    wait_signed_in(driver)


def test_AUTH_05_wrong_otp_five_times(driver, user):
    otp = LoginPage(driver).open().wait_loaded().request_otp(user.phone[3:])
    otp.enter("12345").submit()
    assert otp.field_error("otp") == "Enter the 6-digit code"
    for attempt in range(5):
        otp.verify("000000")
        expected = (f"Incorrect code. {4 - attempt} attempt{'s' if 4 - attempt != 1 else ''} left."
                    if attempt < 4 else "Incorrect code. Request a new one.")
        otp.wait_body_text(expected)
    otp.verify("123456")
    otp.wait_body_text("Too many incorrect attempts. Request a new code.")
    assert otp.path_and_query == "/verify-otp"


def test_AUTH_06_resend_countdown(driver, user):
    otp = LoginPage(driver).open().wait_loaded().request_otp(user.phone[3:])
    resend = otp.visible("auth-resend")
    assert not resend.is_enabled()
    assert re.search(r"Resend OTP in 00:(30|29)", resend.text)
    set_clock(driver, 31_000)
    otp.w.until(lambda d: otp.el("auth-resend").is_enabled())
    assert otp.text("auth-resend") == "Resend OTP"


def test_AUTH_07_new_number_signup(driver):
    phone = unique_phone()
    otp = LoginPage(driver).open().wait_loaded().request_otp(phone)
    otp.verify()
    otp.wait_body_text("Almost there")
    otp.complete_signup("Neha Patil")
    wait_signed_in(driver)


def test_AUTH_08_forgot_password_is_generic(driver, user):
    page = ForgotPasswordPage(driver).open()
    page.request(user.email)
    page.wait_url("/reset-password")
    known = page.text("reset-notice").replace(user.email, "<target>")
    page = ForgotPasswordPage(driver).open()
    unknown_email = "nobody.here@example.com"
    page.request(unknown_email)
    page.wait_url("/reset-password")
    page.w.until(lambda d: unknown_email in page.text("reset-notice"))
    assert page.text("reset-notice").replace(unknown_email, "<target>") == known


def test_AUTH_09_reset_password_cycle(driver, user):
    ForgotPasswordPage(driver).open().request(user.email)
    reset = ResetPasswordPage(driver)
    reset.wait_url("/reset-password")
    reset.reset("123456", "newsecret456")
    reset.wait_url("/login")
    reset.wait_body_text("Password updated. Log in with your new password.")
    # Every earlier session was revoked.
    old = requests.post(f"{API_URL}/auth/refresh", timeout=10, headers={
        "Cookie": f"zp_rt={user.refresh_token}; zp_csrf={CSRF}", "X-CSRF-Token": CSRF,
        "Origin": WEB_URL})
    assert old.status_code == 401
    LoginPage(driver).login_email(user.email, "newsecret456")
    wait_signed_in(driver)


def test_AUTH_10_google_not_configured(driver):
    login = LoginPage(driver).open().wait_loaded()
    login.click("auth-google")
    login.wait_body_text(
        "Google sign-in isn't set up yet. Please continue with your mobile number or email.")


def test_AUTH_11_deep_login_from_bus_seats(driver, user):
    trip = find_bus_trip(seats=2)
    seats = BusSeatsPage(driver).open_trip(trip.trip_id).wait_loaded()
    seats.select_seats(trip.seats[:2])
    seats.choose_points(trip.boarding, trip.dropping)
    seats.continue_()
    seats.wait_url("/login?returnTo=")
    LoginPage(driver).request_otp(user.phone[3:]).verify()
    seats.wait_url(f"/buses/{trip.trip_id}/seats")
    seats.wait_loaded()
    assert seats.selected_seats() == sorted(trip.seats[:2])
    assert seats.attr(f"bus-boarding-{trip.boarding}", "data-selected") == "true"
    assert seats.attr(f"bus-dropping-{trip.dropping}", "data-selected") == "true"


@pytest.mark.parametrize("target", ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)"])
def test_AUTH_12_open_redirects_land_home(driver, user, target):
    login = LoginPage(driver).open(f"/login?returnTo={quote(target, safe='')}").wait_loaded()
    login.login_email(user.email, "secret123")
    wait_signed_in(driver)
    login.w.until(lambda d: login.path_and_query == "/")
    assert driver.current_url.startswith(WEB_URL)


def test_AUTH_13_access_token_expiry_refreshes_silently(driver, user):
    sign_in(driver, user, "/bookings")
    page = Page(driver)
    page.visible("bookings-tab-upcoming")
    set_clock(driver, 20 * 60_000)  # past the 15-minute access token
    page.open("/profile")
    page.wait_body_text("Amit Sharma")
    assert "/login" not in driver.current_url
    assert session_state(driver) == "authenticated"


def test_AUTH_14_refresh_token_reuse_revokes_everything(driver, user):
    sign_in(driver, user, "/bookings")
    page = Page(driver)
    page.visible("bookings-tab-upcoming")
    draft = {"state": {"selection": {"hotelId": "htl_GOI007"}}, "version": 1}
    driver.execute_script("sessionStorage.setItem('zproo:draft:hotel', arguments[0])", json.dumps(draft))
    # A stolen copy of the browser's current refresh token is used elsewhere first.
    current = next(c["value"] for c in driver.execute_cdp_cmd("Network.getAllCookies", {})["cookies"]
                   if c["name"] == "zp_rt")
    stolen = requests.post(f"{API_URL}/auth/refresh", timeout=10, headers={
        "Cookie": f"zp_rt={current}; zp_csrf={CSRF}", "X-CSRF-Token": CSRF, "Origin": WEB_URL})
    assert stolen.status_code == 200
    # The browser's next refresh reuses the old token: every session is revoked.
    set_clock(driver, 20 * 60_000)
    page.open("/profile")
    page.wait_url("/login?returnTo=")
    assert driver.execute_script("return sessionStorage.getItem('zproo:draft:hotel')") is not None
    again = requests.post(f"{API_URL}/auth/refresh", timeout=10, headers={
        "Cookie": f"zp_rt={stolen.cookies.get('zp_rt')}; zp_csrf={CSRF}", "X-CSRF-Token": CSRF,
        "Origin": WEB_URL})
    assert again.status_code == 401


def test_AUTH_15_logout_in_one_tab_logs_out_the_other(driver, user, viewport):
    sign_in(driver, user, "/")
    wait_signed_in(driver)
    first = driver.current_window_handle
    driver.switch_to.new_window("tab")
    driver.get(WEB_URL + "/")
    wait_signed_in(driver)
    second = driver.current_window_handle
    driver.switch_to.window(first)
    page = Page(driver)
    if viewport == "mobile":
        page.click("header-menu")
        page.click("menu-signout")
    else:
        page.click("header-user")
        page.click("header-signout")
    wait_signed_out(driver)
    driver.switch_to.window(second)
    wait_signed_out(driver)


def test_AUTH_16_protected_page_needs_login(driver, user):
    page = Page(driver).open("/bookings")
    page.wait_url("/login?returnTo=%2Fbookings")
    LoginPage(driver).wait_loaded().login_email(user.email, "secret123")
    page.wait_url("/bookings")
    page.visible("bookings-tab-upcoming")


def test_AUTH_17_too_many_login_attempts(driver, user):
    login = LoginPage(driver).open().wait_loaded().use("email")
    login.type("auth-email", user.email)
    for _ in range(10):
        login.type("auth-password", "wrongpass1")
        login.click("auth-submit")
        login.w.until(lambda d: login.exists("field-error-password") or login.has_text("Too many", 0.1))
        login.w.until(lambda d: login.el("auth-submit").is_enabled())
    login.type("auth-password", "wrongpass1")
    login.click("auth-submit")
    login.w.until(lambda d: re.search(r"Too many attempts\. Please try again in \d+ seconds\.",
                                      login.body_text()))
