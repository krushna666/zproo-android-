"""BUS-01…22: search, filters, seats, checkout, scenarios and cancellation (Prompt 04 §4.2).
Each test uses its own travel date, so parallel tests never compete for the same seats."""
from __future__ import annotations

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

from tests.e2e.conftest import set_clock, set_scenario, sign_in
from tests.e2e.flows import api_book_bus, bus_to_review
from tests.e2e.pages.base import Page
from tests.e2e.pages.bus import (BusResultsPage, BusSearchForm, BusSeatsPage, BusTravellersPage,
                                 find_bus_trip)
from tests.e2e.pages.checkout import BookingsPage, ConfirmationPage, PaymentPage
from tests.support import Api, ist_date

pytestmark = pytest.mark.bus


def open_filters(page: Page, viewport: str) -> None:
    if viewport == "mobile":
        page.click("bus-filters-open")


def apply_filters(page: Page, viewport: str) -> None:
    if viewport == "mobile":
        page.click("bus-filters-apply")


@pytest.mark.smoke
def test_BUS_01_search(driver):
    page = Page(driver).open("/buses")
    BusSearchForm(driver).search("Pune", "Mumbai", ist_date(7))
    page.wait_url(f"/buses/search?from=PNQ&to=BOM&date={ist_date(7)}")
    results = BusResultsPage(driver).wait_results()
    assert results.cards()
    assert results.text("bus-results-count").endswith("found")
    WebDriverWait(driver, 10).until(lambda d: d.title == "Buses from Pune to Mumbai | ZPROO GO")


def test_BUS_02_same_cities(driver):
    page = Page(driver).open("/buses")
    BusSearchForm(driver).search("Pune", "Pune")
    page.wait_body_text("Choose different cities for From and To")
    assert "/buses/search" not in driver.current_url


def test_BUS_03_swap(driver):
    page = Page(driver).open("/buses")
    form = BusSearchForm(driver)
    form.choose_city("bus-search-from", "Pune").choose_city("bus-search-to", "Nashik")
    form.click("bus-search-swap")
    form.click("bus-search-submit")
    page.wait_url("from=ISK&to=PNQ")


def test_BUS_04_past_date_deep_link(driver):
    page = BusResultsPage(driver).open_search("PNQ", "BOM", ist_date(-2))
    error = page.visible("bus-results-error")
    assert "Choose a date within the next 120 days" in error.text
    assert page.attr("bus-search-from", "value") == "Pune"


def test_BUS_05_filter_ac_sleeper(driver, viewport):
    results = BusResultsPage(driver).open_search("PNQ", "BOM", ist_date(8)).wait_results()
    open_filters(results, viewport)
    results.click("bus-filter-ac")
    results.click("bus-filter-sleeper")
    apply_filters(results, viewport)
    results.w.until(lambda d: "type=ac%2Csleeper" in d.current_url or "type=sleeper%2Cac" in d.current_url)
    results.visible("bus-filter-chip-type-ac")
    results.visible("bus-filter-chip-type-sleeper")
    results.w.until(lambda d: all(c.get_attribute("data-ac") == "true" and c.get_attribute("data-sleeper") == "true"
                                  for c in results.cards()) and results.cards())


@pytest.mark.parametrize("sort,attr,reverse", [("cheapest", "data-price", False),
                                                ("fastest", "data-duration", False),
                                                ("earliest", "data-departure", False)])
def test_BUS_06_sorts(driver, sort, attr, reverse):
    results = BusResultsPage(driver).open_search("PNQ", "BOM", ist_date(9)).wait_results()
    results.click(f"bus-sort-{sort}")
    results.w.until(lambda d: results.attr(f"bus-sort-{sort}", "aria-checked") == "true")
    key = (lambda v: v) if attr == "data-departure" else (lambda v: float(v))
    results.w.until(lambda d: (lambda vals: vals == sorted(vals, reverse=reverse))(
        [key(v) for v in results.values(attr)]))


def test_BUS_07_filters_without_match(driver, viewport):
    results = BusResultsPage(driver).open_search(
        "PNQ", "BOM", ist_date(10), "&price=100").wait_results()
    results.visible("bus-results-empty")
    results.wait_body_text("No buses match your filters")
    results.click("bus-results-clear")
    results.w.until(lambda d: len(results.cards()) > 0)


def test_BUS_08_date_strip(driver):
    results = BusResultsPage(driver).open_search("PNQ", "BOM", ist_date(11)).wait_results()
    results.click(f"bus-date-strip-{ist_date(12)}")
    results.wait_url(f"date={ist_date(12)}")
    results.w.until(lambda d: results.cards() and all(ist_date(12) in (c.get_attribute("data-departure") or "")
                                                      for c in results.cards()))


def test_BUS_09_decks_and_legend(driver):
    trip = find_bus_trip(days=13, two_decks=True)
    seats = BusSeatsPage(driver).open_trip(trip.trip_id).wait_loaded()
    seats.click("bus-deck-upper")
    assert seats.attr("bus-deck-upper", "aria-pressed") == "true"
    seats.w.until(lambda d: any(s.is_displayed() and (s.get_attribute("data-testid") or "").startswith("bus-seat-U")
                                for s in seats.all("bus-seat-")))
    seats.click("bus-deck-lower")
    assert driver.find_element(By.CSS_SELECTOR, '[aria-label="Seat legend"]').is_displayed()


def test_BUS_10_booked_seat_not_selectable(driver):
    trip = find_bus_trip(days=14)
    seats = BusSeatsPage(driver).open_trip(trip.trip_id).wait_loaded()
    booked = next(s for s in seats.all("bus-seat-") if s.get_attribute("data-status") == "BOOKED" and s.is_displayed())
    assert booked.get_attribute("aria-disabled") == "true"
    seats.click_el(booked)
    assert booked.get_attribute("aria-pressed") != "true"


def test_BUS_11_seat_limit(driver):
    trip = find_bus_trip(seats=7, days=15)
    seats = BusSeatsPage(driver).open_trip(trip.trip_id).wait_loaded()
    seats.select_seats(trip.seats[:6])
    seats.click(f"bus-seat-{trip.seats[6]}")
    assert seats.toast("error") == "You can select up to 6 seats"
    assert len(seats.selected_seats()) == 6


def test_BUS_12_ladies_seat_needs_a_woman(driver, user):
    trip = find_bus_trip(days=16)
    sign_in(driver, user, f"/buses/{trip.trip_id}/seats")
    seats = BusSeatsPage(driver).wait_loaded()
    ladies = next(s for s in seats.all("bus-seat-")
                  if s.get_attribute("data-status") == "AVAILABLE" and s.is_displayed()
                  and "women" in (s.get_attribute("aria-label") or ""))
    seats.click_el(ladies)
    seats.choose_points(trip.boarding, trip.dropping).continue_()
    seats.wait_url("/buses/booking")
    travellers = BusTravellersPage(driver)
    travellers.fill([("Amit Sharma", 30, "MALE")]).continue_()
    travellers.wait_body_text("This seat is reserved for women")
    assert "/buses/booking" in driver.current_url


def test_BUS_13_boarding_point_required(driver):
    trip = find_bus_trip(days=17)
    seats = BusSeatsPage(driver).open_trip(trip.trip_id).wait_loaded()
    seats.select_seats(trip.seats[:1])
    # Continue stays disabled until both points are chosen; the picker says what is missing.
    assert not seats.el("bus-seats-continue").is_enabled()
    assert seats.field_error("boardingPointId") == "Choose a boarding point"


@pytest.mark.smoke
def test_BUS_14_happy_path(driver, user, user_api):
    trip = find_bus_trip(seats=2, days=18)
    review = bus_to_review(driver, user, trip)
    review.accept_and_proceed()
    review.wait_url("/buses/payment")
    PaymentPage(driver).wait_loaded().pay("upi")
    review.wait_url("/buses/confirmation")
    confirm = ConfirmationPage(driver).wait_confirmed()
    ref = confirm.reference()
    assert confirm.pnr()
    bookings = BookingsPage(driver).open()
    bookings.visible(f"booking-{ref}")
    assert bookings.status_of(ref) == "CONFIRMED"
    pdf = user_api.get(f"/bookings/{ref}/ticket.pdf")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"].startswith("application/pdf")


def test_BUS_15_seat_taken(driver, user):
    trip = find_bus_trip(days=19)
    sign_in(driver, user, f"/buses/{trip.trip_id}/seats")
    seats = BusSeatsPage(driver).wait_loaded()
    seats.select_seats(trip.seats[:1]).choose_points(trip.boarding, trip.dropping).continue_()
    seats.wait_url("/buses/booking")
    set_scenario(driver, "seat_taken")
    BusTravellersPage(driver).fill([("Amit Sharma", 30, "MALE")]).continue_()
    assert f"Seat {trip.seats[0]} was just booked by someone else" in seats.toast("error")
    seats.wait_url(f"/buses/{trip.trip_id}/seats")
    set_scenario(driver, None)
    seats.w.until(lambda d: seats.seat(trip.seats[0]).get_attribute("data-status") in ("BOOKED", "HELD"))
    assert seats.seat(trip.seats[0]).get_attribute("aria-pressed") != "true"


def test_BUS_16_price_changed(driver, user):
    trip = find_bus_trip(days=20)
    sign_in(driver, user, f"/buses/{trip.trip_id}/seats")
    seats = BusSeatsPage(driver).wait_loaded()
    seats.select_seats(trip.seats[:1]).choose_points(trip.boarding, trip.dropping).continue_()
    seats.wait_url("/buses/booking")
    set_scenario(driver, "price_changed")
    BusTravellersPage(driver).fill([("Amit Sharma", 30, "MALE")]).continue_()
    dialog = seats.visible("dialog-price-changed")
    assert "changed from" in dialog.text
    seats.click("dialog-price-continue")
    seats.wait_url("/buses/review?ref=")


def test_BUS_17_hold_expiry(driver, user):
    trip = find_bus_trip(days=21)
    review = bus_to_review(driver, user, trip, trip.seats[:1])
    review.accept_and_proceed()
    review.wait_url("/buses/payment")
    PaymentPage(driver).wait_loaded()
    set_clock(driver, 16 * 60_000)
    expired = review.visible("checkout-hold-expired", timeout=10)
    assert "Your hold has expired. Please start again." in expired.text
    assert not review.exists("checkout-pay-submit") or not review.el("checkout-pay-submit").is_enabled()


def test_BUS_18_coupons(driver, user):
    trip = find_bus_trip(seats=2, days=22)
    review = bus_to_review(driver, user, trip)
    before = review.total()
    review.apply_coupon("NOTACODE")
    assert review.field_error("coupon").startswith("This coupon can't be used for this booking.")
    review.apply_coupon("BUS10")
    review.visible("checkout-coupon-remove")
    review.w.until(lambda d: review.total() != before)
    review.click("checkout-coupon-remove")
    review.w.until(lambda d: review.total() == before)


def test_BUS_19_double_click_pay(driver, user, user_api):
    trip = find_bus_trip(days=23)
    review = bus_to_review(driver, user, trip, trip.seats[:1])
    review.accept_and_proceed()
    review.wait_url("/buses/payment")
    pay = PaymentPage(driver).wait_loaded()
    pay.click("checkout-pay-method-upi")
    button = pay.w.until(lambda d: (b := pay.el("checkout-pay-submit")).is_enabled() and b)
    pay.double_click(button)
    pay.wait_url("/buses/confirmation")
    ConfirmationPage(driver).wait_confirmed()
    bookings = user_api.get("/bookings").json()["data"]
    assert len(bookings) == 1 and bookings[0]["status"] == "CONFIRMED"


def test_BUS_20_cancel(driver, user, user_api):
    trip = find_bus_trip(days=24)
    review = bus_to_review(driver, user, trip, trip.seats[:1])
    review.accept_and_proceed()
    review.wait_url("/buses/payment")
    PaymentPage(driver).wait_loaded().pay()
    ref = ConfirmationPage(driver).wait_confirmed().reference()
    bookings = BookingsPage(driver).open()
    bookings.click("booking-cancel")
    assert bookings.text("booking-refund-amount").startswith("₹")
    bookings.click("booking-cancel-confirm")
    bookings.tab("cancelled")
    bookings.visible(f"booking-{ref}")
    assert bookings.status_of(ref) in ("CANCELLED", "REFUND_PENDING")


def test_BUS_21_provider_down(driver):
    set_scenario(driver, "provider_down")
    results = BusResultsPage(driver).open_search("PNQ", "BOM", ist_date(25))
    error = results.visible("bus-results-error", timeout=40)
    assert "We couldn't reach the operator right now. Please try again." in error.text
    set_scenario(driver, None)
    results.click("bus-results-retry")
    results.w.until(lambda d: len(results.cards()) > 0)


def test_BUS_22_seat_map_refreshes(driver):
    trip = find_bus_trip(seats=2, days=26)
    seats = BusSeatsPage(driver).open_trip(trip.trip_id).wait_loaded()
    other = Api.as_user(Api.create_user())
    api_book_bus(other, trip, trip.seats[1:2])
    WebDriverWait(driver, 35).until(
        lambda d: seats.seat(trip.seats[1]).get_attribute("data-status") in ("HELD", "BOOKED"))
