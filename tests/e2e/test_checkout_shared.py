"""CHK-01…07: the shared checkout (review, payment, confirmation) across services."""
from __future__ import annotations

import re

import pytest
from selenium.webdriver.support.ui import WebDriverWait

from tests.e2e.conftest import sign_in
from tests.e2e.flows import api_book_bus, bus_to_review
from tests.e2e.pages.base import Page
from tests.e2e.pages.bus import BusSeatsPage, BusTravellersPage, find_bus_trip
from tests.e2e.pages.flight import FlightFaresPage, FlightTravellersPage, find_flight
from tests.e2e.pages.checkout import ConfirmationPage, PaymentPage
from tests.support import Api

pytestmark = pytest.mark.checkout


def rupees(text: str) -> int:
    return int(re.sub(r"[^\d]", "", text.split(".")[0]))


def test_CHK_01_terms_required(driver, user):
    trip = find_bus_trip(days=70)
    review = bus_to_review(driver, user, trip, trip.seats[:1])
    review.click("checkout-proceed")
    assert review.field_error("terms") == "Please accept the terms to continue"
    assert review.attr("checkout-terms", "aria-invalid") == "true"
    assert "/buses/review" in driver.current_url


def test_CHK_02_declined_payment_then_retry(driver, user, user_api):
    trip = find_bus_trip(days=71)
    review = bus_to_review(driver, user, trip, trip.seats[:1])
    review.accept_and_proceed()
    review.wait_url("/buses/payment")
    pay = PaymentPage(driver).wait_loaded()
    pay.click("checkout-pay-method-card")
    pay.w.until(lambda d: pay.el("checkout-pay-fail").is_enabled())
    pay.click("checkout-pay-fail")
    pay.wait_body_text("The payment was declined. No money was taken — you can try again.")
    assert "/buses/payment" in driver.current_url
    pay.w.until(lambda d: pay.el("checkout-pay-submit").is_enabled())
    pay.click("checkout-pay-submit")
    pay.wait_url("/buses/confirmation")
    ref = ConfirmationPage(driver).wait_confirmed().reference()
    bookings = user_api.get("/bookings").json()["data"]
    assert [(b["reference"], b["status"]) for b in bookings] == [(ref, "CONFIRMED")]


@pytest.mark.parametrize("service,title", [("buses", "No bus selected"), ("flights", "No flight selected"),
                                           ("hotels", "No room selected")])
def test_CHK_03_checkout_without_selection(driver, user, service, title):
    sign_in(driver, user, f"/{service}/booking")
    page = Page(driver)
    page.wait_body_text(title)
    page.w.until(lambda d: d.title.startswith(title))


def test_CHK_04_someone_elses_booking(driver, user):
    trip = find_bus_trip(days=72)
    other = Api.as_user(Api.create_user())
    theirs = api_book_bus(other, trip, trip.seats[:1])
    ref = theirs.get("bookingRef") or theirs.get("reference")
    sign_in(driver, user, f"/buses/payment?ref={ref}")
    page = Page(driver)
    page.w.until(lambda d: "You don't have access" in page.body_text()
                 or "Something went wrong" in page.body_text() or "not found" in page.body_text().lower())
    assert not page.exists("checkout-pay-submit")
    assert ref not in page.body_text()


def test_CHK_05_totals_agree_through_checkout(driver, user, user_api):
    trip = find_bus_trip(seats=2, days=73)
    review = bus_to_review(driver, user, trip)
    review_total = rupees(review.total())
    timer = review.text("checkout-hold-timer")
    assert re.search(r"\b1[45]:\d\d\b", timer)
    review.accept_and_proceed()
    review.wait_url("/buses/payment")
    pay = PaymentPage(driver).wait_loaded()
    assert rupees(pay.text("checkout-total")) == review_total
    pay.pay()
    pay.wait_url("/buses/confirmation")
    ref = ConfirmationPage(driver).wait_confirmed().reference()
    booking = user_api.get(f"/bookings/{ref}").json()["data"]
    assert booking["price"]["totalPaise"] == review_total * 100


def test_CHK_06_confirmation_pdf(driver, user, tmp_path):
    trip = find_bus_trip(days=74)
    review = bus_to_review(driver, user, trip, trip.seats[:1])
    review.accept_and_proceed()
    review.wait_url("/buses/payment")
    PaymentPage(driver).wait_loaded().pay()
    review.wait_url("/buses/confirmation")
    confirm = ConfirmationPage(driver).wait_confirmed()
    folder = tmp_path / "downloads"
    folder.mkdir()
    driver.execute_cdp_cmd("Browser.setDownloadBehavior", {"behavior": "allow", "downloadPath": str(folder)})
    confirm.w.until(lambda d: confirm.el("confirm-download-pdf").is_enabled())
    confirm.click("confirm-download-pdf")
    confirm.w.until(lambda d: [f for f in folder.iterdir() if f.suffix == ".pdf"])
    pdf = next(f for f in folder.iterdir() if f.suffix == ".pdf")
    confirm.w.until(lambda d: pdf.stat().st_size > 1000)
    assert pdf.read_bytes()[:5] == b"%PDF-"


def test_CHK_07_saved_travellers(driver, user, user_api):
    """SOP §6.3: "Save traveller for next time" at one checkout, offered on the next one, and
    listed (removable) on the profile."""
    trip = find_bus_trip(days=75)
    sign_in(driver, user, f"/buses/{trip.trip_id}/seats")
    seats = BusSeatsPage(driver).wait_loaded()
    seats.select_seats(trip.seats[:1]).choose_points(trip.boarding, trip.dropping).continue_()
    seats.wait_url("/buses/booking")
    travellers = BusTravellersPage(driver).fill([("Neha Patil", 29, "FEMALE")])
    travellers.click("checkout-traveller-0-save")
    travellers.continue_()
    travellers.wait_url("/buses/review?ref=")
    WebDriverWait(driver, 15).until(lambda d: user_api.get("/me/travellers").json()["data"])
    saved = user_api.get("/me/travellers").json()["data"]
    assert [(t["firstName"], t["lastName"], t["gender"]) for t in saved] == [("Neha", "Patil", "FEMALE")]

    offer = find_flight(days=76)
    fares = FlightFaresPage(driver).open_offer(offer.offer_id).wait_loaded()
    fares.continue_()
    fares.wait_url("/flights/booking")
    form = FlightTravellersPage(driver).wait_loaded()
    form.select("checkout-traveller-0-saved", saved[0]["id"])
    form.w.until(lambda d: form.attr("checkout-traveller-0-first-name", "value") == "Neha")
    assert form.attr("checkout-traveller-0-last-name", "value") == "Patil"
    assert form.el("checkout-traveller-0-gender-female").is_selected()

    profile = Page(driver).open("/profile")
    row = profile.visible(f"saved-traveller-{saved[0]['id']}")
    assert "Neha Patil" in row.text
    profile.click(f"saved-traveller-remove-{saved[0]['id']}")
    profile.visible("saved-travellers-empty")
    assert user_api.get("/me/travellers").json()["data"] == []
