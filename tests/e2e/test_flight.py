"""FLT-01…16: search, filters, fares, travellers, checkout and scenarios (Prompt 04 §4.3).
Each test searches its own travel date, so parallel tests rarely share a flight."""
from __future__ import annotations

import pytest
from selenium.webdriver.common.keys import Keys

from tests.e2e.conftest import set_clock, set_scenario, sign_in
from tests.e2e.flows import flight_to_review
from tests.e2e.pages.auth import LoginPage
from tests.e2e.pages.base import Page
from tests.e2e.pages.checkout import ConfirmationPage, PaymentPage
from tests.e2e.pages.flight import (FlightFaresPage, FlightResultsPage, FlightSearchForm,
                                    FlightTravellersPage, find_flight, flight_query)
from tests.support import WEB_URL, ist_date

pytestmark = pytest.mark.flight


def pay_and_confirm(driver, review, timeout: float = 30) -> ConfirmationPage:
    review.accept_and_proceed()
    review.wait_url("/flights/payment")
    PaymentPage(driver).wait_loaded().pay()
    review.wait_url("/flights/confirmation")
    return ConfirmationPage(driver).wait_confirmed(timeout)


def years_before(date: str, years: int, days: int = 0) -> str:
    y, m, d = (int(x) for x in date.split("-"))
    from datetime import date as _date, timedelta
    return (_date(y - years, m, d if not (m == 2 and d == 29) else 28) - timedelta(days=days)).isoformat()


@pytest.mark.smoke
def test_FLT_01_one_way_search(driver):
    page = Page(driver).open("/flights")
    FlightSearchForm(driver).trip("oneway").search("Pune", "Delhi", ist_date(30))
    page.wait_url(f"/flights/search?from=PNQ&to=DEL&date={ist_date(30)}")
    results = FlightResultsPage(driver).wait_results()
    cards = results.cards()
    assert cards
    assert results.text("flight-results-count").endswith("found")
    for card in cards[:5]:
        code = card.find_element("css selector", '[data-testid="flight-airline-code"]').text
        assert len(code) == 2 and code.isupper()
        stops = int(card.get_attribute("data-stops") or 0)
        assert ("Non-stop" if stops == 0 else f"{stops} stop") in card.text


def test_FLT_02_infants_need_adults(driver):
    Page(driver).open("/flights")
    form = FlightSearchForm(driver)
    form.travellers(adults=1, infants=2, done=False)
    assert form.text("field-error-pax") == "Each infant must travel with an adult"


def test_FLT_03_nine_travellers_max(driver):
    Page(driver).open("/flights")
    form = FlightSearchForm(driver)
    form.travellers(adults=9, children=1, done=False)
    assert form.text("field-error-pax") == "You can book up to 9 travellers at a time"


def test_FLT_04_return_before_departure(driver):
    page = Page(driver).open("/flights")
    form = FlightSearchForm(driver).trip("round")
    form.search("Pune", "Delhi", ist_date(31), ist_date(29))
    page.wait_body_text("Return date must be on or after the departure date")
    assert "/flights/search" not in driver.current_url


def test_FLT_05_filter_non_stop(driver, viewport):
    results = FlightResultsPage(driver).open_search(flight_query(days=32)).wait_results()
    if viewport == "mobile":
        results.click("flight-filters-open")
    results.click("flight-filter-stops-0")
    if viewport == "mobile":
        results.click("flight-filters-apply")
    results.wait_url("stops=0")
    results.w.until(lambda d: results.cards() and all(
        c.get_attribute("data-stops") == "0" for c in results.cards()))
    assert all("Non-stop" in c.text for c in results.cards())


@pytest.mark.parametrize("sort,attr", [("cheapest", "data-price"), ("fastest", "data-duration")])
def test_FLT_06_sort(driver, sort, attr):
    results = FlightResultsPage(driver).open_search(flight_query(days=33)).wait_results()
    results.click(f"flight-sort-{sort}")
    results.wait_url(f"sort={sort}")
    results.w.until(lambda d: (v := results.values(attr)) == sorted(v) and len(v) > 1)


def test_FLT_07_fare_families(driver):
    offer = find_flight(days=34)
    fares = FlightFaresPage(driver).open_offer(offer.offer_id).wait_loaded()
    names = [f["name"] for f in offer.fares]
    assert names == ["Saver", "Flexi", "Super Flexi"]
    for f in offer.fares:
        card = fares.visible(f"flight-fare-{f['fareId']}")
        assert f["name"] in card.text and "Check-in bag" in card.text and "Cabin bag" in card.text
    # Keyboard: the selected fare takes focus; arrows move the choice.
    first = fares.el(f"flight-fare-{offer.fares[0]['fareId']}")
    driver.execute_script("arguments[0].focus()", first)
    first.send_keys(Keys.ARROW_RIGHT)
    fares.w.until(lambda d: fares.selected() == [offer.fares[1]["fareId"]])
    driver.switch_to.active_element.send_keys(Keys.ARROW_RIGHT)
    fares.w.until(lambda d: fares.selected() == [offer.fares[2]["fareId"]])


def test_FLT_08_offer_expiry_reprices(driver):
    offer = find_flight(days=35)
    fares = FlightFaresPage(driver).open_offer(offer.offer_id).wait_loaded()
    # Past the 20-minute offer: re-priced (same price → a fresh offer, no dialog).
    set_clock(driver, 21 * 60_000)
    fares.w.until(lambda d: offer.offer_id not in d.current_url)
    fares.wait_loaded()
    # The next expiry finds the fare gone.
    set_scenario(driver, "fare_unavailable")
    set_clock(driver, 42 * 60_000)
    unavailable = fares.visible("flight-fare-unavailable", timeout=30)
    assert "This fare is no longer available. Please choose another flight or fare." in unavailable.text


def test_FLT_09_child_age_on_travel_date(driver, user):
    offer = find_flight(days=36, adults=1, children=1)
    sign_in(driver, user, f"/flights/offer/{offer.offer_id}")
    fares = FlightFaresPage(driver).wait_loaded()
    fares.continue_()
    fares.wait_url("/flights/booking")
    page = FlightTravellersPage(driver).wait_loaded()
    page.fill([("Amit", "Sharma", "MALE", None), ("Kabir", "Sharma", "MALE", years_before(offer.date, 12))])
    page.continue_()
    assert page.field_error("traveller-1-dob") == "A child must be 2–11 years old on the travel date"
    assert "/flights/booking" in driver.current_url


@pytest.mark.smoke
def test_FLT_10_one_way_happy_path(driver, user, user_api):
    offer = find_flight(days=37, adults=2)
    review = flight_to_review(driver, user, offer.offer_id, pax=offer.pax)
    confirm = pay_and_confirm(driver, review)
    ref = confirm.reference()
    assert confirm.pnr()
    booking = user_api.get(f"/bookings/{ref}").json()["data"]
    assert booking["status"] == "CONFIRMED"
    tickets = [t["ticketNumber"] for f in booking["flights"] for t in f["tickets"]]
    assert len(tickets) == 2 and len(set(tickets)) == 2
    for i in range(2):
        assert confirm.text(f"confirm-tickets-{i}") in tickets


def test_FLT_11_round_trip_happy_path(driver, user, user_api):
    q = flight_query(days=38, return_days=41)
    sign_in(driver, user, "/flights/search?" + "&".join(f"{k}={v}" for k, v in q.items()))
    results = FlightResultsPage(driver).wait_results()
    out = results.cards()[0].get_attribute("data-testid")[len("flight-result-card-"):]
    results.click(f"flight-select-out-{out}")
    results.w.until(lambda d: results.all("flight-select-ret-"))
    ret = next(e for e in results.all("flight-select-ret-") if e.is_displayed())
    results.click_el(ret)
    results.click("flight-continue")
    fares = FlightFaresPage(driver).wait_loaded()
    fares.wait_url("return=")
    fares.continue_()
    fares.wait_url("/flights/booking")
    FlightTravellersPage(driver).wait_loaded().fill([("Amit", "Sharma", "MALE", None)]).continue_()
    fares.wait_url("/flights/review?ref=")
    from tests.e2e.pages.checkout import ReviewPage
    review = ReviewPage(driver).wait_loaded()
    total = review.total()
    confirm = pay_and_confirm(driver, review)
    booking = user_api.get(f"/bookings/{confirm.reference()}").json()["data"]
    assert [f["sequence"] for f in booking["flights"]] == [1, 2]
    assert confirm.text("confirm-pnr") and confirm.text("confirm-pnr-2")
    assert booking["price"]["totalPaise"] == int(total.lstrip("₹").replace(",", "")) * 100
    assert total.startswith("₹")


def test_FLT_12_price_changed_at_booking(driver, user):
    offer = find_flight(days=39)
    sign_in(driver, user, f"/flights/offer/{offer.offer_id}")
    fares = FlightFaresPage(driver).wait_loaded()
    fares.continue_()
    fares.wait_url("/flights/booking")
    page = FlightTravellersPage(driver).wait_loaded()
    page.fill([("Amit", "Sharma", "MALE", None)])
    set_scenario(driver, "price_changed")
    page.continue_()
    dialog = page.visible("dialog-price-changed")
    assert "₹" in dialog.text
    page.click("dialog-price-continue")
    page.wait_url("/flights/review?ref=")


def test_FLT_13_issue_pending(driver, user):
    offer = find_flight(days=40)
    # The airline's answer is decided when the booking is made (the scenario is stored on it).
    set_scenario(driver, "issue_pending")
    review = flight_to_review(driver, user, offer.offer_id)
    review.accept_and_proceed()
    review.wait_url("/flights/payment")
    PaymentPage(driver).wait_loaded().pay()
    review.wait_url("/flights/confirmation")
    pending = review.visible("flight-status-pending", timeout=20)
    assert "Confirming with the airline..." in pending.text
    ConfirmationPage(driver).wait_confirmed(timeout=60)


def test_FLT_14_deep_login_from_fare_page(driver, user):
    offer = find_flight(days=42)
    flexi = offer.fares[1]["fareId"]
    fares = FlightFaresPage(driver).open_offer(offer.offer_id).wait_loaded()
    fares.choose(flexi).continue_()
    fares.wait_url("/login?returnTo=")
    LoginPage(driver).wait_loaded().login_email(user.email, "secret123")
    fares.wait_url(f"/flights/offer/{offer.offer_id}")
    fares.wait_loaded()
    fares.w.until(lambda d: fares.selected() == [flexi])


def test_FLT_15_session_expiry_keeps_traveller_form(driver, user):
    offer = find_flight(days=43)
    sign_in(driver, user, f"/flights/offer/{offer.offer_id}")
    fares = FlightFaresPage(driver).wait_loaded()
    fares.continue_()
    fares.wait_url("/flights/booking")
    page = FlightTravellersPage(driver).wait_loaded()
    page.fill([("Rahul", "Verma", "MALE", None)], email="rahul@example.com", mobile="9812345678")
    # The session ends: the refresh cookie is gone and the access token has expired.
    driver.execute_cdp_cmd("Network.deleteCookies", {"name": "zp_rt", "url": WEB_URL + "/api/auth"})
    set_clock(driver, 16 * 60_000)
    page.continue_()
    page.wait_url("/login?returnTo=")
    LoginPage(driver).wait_loaded().login_email(user.email, "secret123")
    page.wait_url("/flights/booking")
    page.wait_loaded()
    page.w.until(lambda d: page.attr("checkout-traveller-0-first-name", "value") == "Rahul")
    assert page.attr("checkout-traveller-0-last-name", "value") == "Verma"
    assert page.attr("checkout-contact-email", "value") == "rahul@example.com"


def test_FLT_16_mobile_layout(driver, viewport):
    if viewport != "mobile":
        driver.set_window_size(390, 844)
    page = Page(driver).open("/flights")
    form = FlightSearchForm(driver)
    form.travellers(adults=2)
    form.w.until(lambda d: "2 Travellers" in form.text("flight-pax-open"))
    no_scroll = "return document.documentElement.scrollWidth <= document.documentElement.clientWidth"
    assert driver.execute_script(no_scroll)
    offer = find_flight(days=44)
    fares = FlightFaresPage(driver).open_offer(offer.offer_id).wait_loaded()
    bar = fares.visible("flight-continue")
    in_view = driver.execute_script(
        "const r = arguments[0].getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0", bar)
    assert in_view
    assert driver.execute_script(no_scroll)
    page.open(f"/flights/search?{'&'.join(f'{k}={v}' for k, v in flight_query(days=44).items())}")
    FlightResultsPage(driver).wait_results()
    assert driver.execute_script(no_scroll)
