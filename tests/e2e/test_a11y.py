"""Accessibility (Prompt 04 §4.6): axe-core on every step of each journey (0 serious/critical),
keyboard-only bus booking, accessible names for icon buttons, 44px touch targets on phones."""
from __future__ import annotations

import pytest
from axe_selenium_python import Axe
from selenium.webdriver.common.keys import Keys

from tests.e2e.conftest import sign_in
from tests.e2e.pages.base import Page
from tests.e2e.pages.bus import BusSeatsPage, BusTravellersPage, find_bus_trip
from tests.e2e.pages.checkout import ConfirmationPage, PaymentPage, ReviewPage
from tests.e2e.pages.flight import FlightFaresPage, FlightTravellersPage, find_flight, flight_query
from tests.e2e.pages.hotel import HotelDetailsPage, HotelGuestsPage, find_rate
from tests.support import ist_date

pytestmark = pytest.mark.a11y


def settle(page: Page) -> None:
    page.w.until(lambda d: d.execute_script("return document.readyState") == "complete"
                 and not d.find_elements("css selector", '[aria-busy="true"], [data-testid$="-loading"]'))


def assert_accessible(driver, label: str) -> None:
    settle(Page(driver))
    axe = Axe(driver)
    axe.inject()
    results = axe.run(options={"resultTypes": ["violations"]})
    bad = [v for v in results["violations"] if v["impact"] in ("serious", "critical")]
    report = "\n".join(f"{v['id']} ({v['impact']}): {v['help']} — "
                       f"{[n['target'] for n in v['nodes'][:3]]}" for v in bad)
    assert not bad, f"{label}:\n{report}"


@pytest.mark.parametrize("path", [
    "/", "/login", "/signup", "/forgot-password", "/buses", "/flights", "/hotels",
    f"/buses/search?from=PNQ&to=BOM&date={ist_date(90)}",
    "/flights/search?" + "&".join(f"{k}={v}" for k, v in flight_query(days=90).items()),
    f"/hotels/search?destinationId=city_GOI&checkIn={ist_date(90)}&checkOut={ist_date(92)}&rooms=2-0",
])
def test_A11Y_01_public_pages(driver, path):
    Page(driver).open(path)
    assert_accessible(driver, path)


def test_A11Y_02_bus_journey(driver, user):
    trip = find_bus_trip(days=91)
    sign_in(driver, user, f"/buses/{trip.trip_id}/seats")
    seats = BusSeatsPage(driver).wait_loaded()
    assert_accessible(driver, "bus seats")
    seats.select_seats(trip.seats[:1]).choose_points(trip.boarding, trip.dropping).continue_()
    seats.wait_url("/buses/booking")
    travellers = BusTravellersPage(driver)
    travellers.visible("checkout-traveller-0-name")
    assert_accessible(driver, "bus travellers")
    travellers.fill([("Amit Sharma", 30, "MALE")]).continue_()
    seats.wait_url("/buses/review?ref=")
    review = ReviewPage(driver).wait_loaded()
    assert_accessible(driver, "bus review")
    review.accept_and_proceed()
    review.wait_url("/buses/payment")
    payment = PaymentPage(driver).wait_loaded()
    assert_accessible(driver, "bus payment")
    payment.pay()
    payment.wait_url("/buses/confirmation")
    ConfirmationPage(driver).wait_confirmed()
    assert_accessible(driver, "bus confirmation")
    Page(driver).open("/bookings")
    assert_accessible(driver, "my bookings")


def test_A11Y_03_flight_journey(driver, user):
    offer = find_flight(days=92)
    sign_in(driver, user, f"/flights/offer/{offer.offer_id}")
    fares = FlightFaresPage(driver).wait_loaded()
    assert_accessible(driver, "flight fares")
    fares.continue_()
    fares.wait_url("/flights/booking")
    FlightTravellersPage(driver).wait_loaded()
    assert_accessible(driver, "flight travellers")


def test_A11Y_04_hotel_journey(driver, user):
    stay, rates = find_rate("htl_GOI011", 93)
    sign_in(driver, user, stay.details_path)
    details = HotelDetailsPage(driver).wait_loaded()
    assert_accessible(driver, "hotel details")
    details.select_rates(rates).reserve()
    details.wait_url("/hotels/booking")
    HotelGuestsPage(driver).wait_loaded()
    assert_accessible(driver, "hotel guests")


def focused_testid(driver) -> str:
    """The test id of the focused element, or of the label/card around it (native radios)."""
    return driver.execute_script(
        "const a = document.activeElement;"
        "return a?.dataset?.testid || a?.closest('[data-testid]')?.dataset?.testid || ''")


def tab_to(driver, test_id: str, presses: int = 400, prefix: bool = False) -> None:
    """Moves focus with Tab only until the element (or the radio/checkbox inside it) has it."""
    for _ in range(presses):
        if driver.execute_script(
                "const a = document.activeElement, id = arguments[0], prefix = arguments[1];"
                "const t = a?.dataset?.testid || a?.closest('label[data-testid]')?.dataset?.testid || '';"
                "if (!a || a === document.body) return false;"
                "return prefix ? t.startsWith(id) : (t === id"
                " || (a.tagName === 'LABEL' && !!a.querySelector(`[data-testid=\"${id}\"]`)))",
                test_id, prefix):
            return
        driver.switch_to.active_element.send_keys(Keys.TAB)
    raise AssertionError(f"Tab never reached {test_id}")


def press(driver, *keys: str) -> None:
    driver.switch_to.active_element.send_keys(*keys)


@pytest.mark.desktop
def test_A11Y_05_keyboard_only_bus_booking(driver, user):
    trip = find_bus_trip(days=94)
    sign_in(driver, user, f"/buses/{trip.trip_id}/seats")
    seats = BusSeatsPage(driver).wait_loaded()
    # The seat map is one tab stop; arrow keys move between seats.
    tab_to(driver, "bus-seat-", prefix=True)
    for _ in range(60):
        seat = driver.switch_to.active_element
        label = seat.get_attribute("aria-label") or ""
        if seat.get_attribute("data-status") == "AVAILABLE" and "women" not in label:
            break
        press(driver, Keys.ARROW_RIGHT)
    else:
        raise AssertionError("no open seat reachable with the arrow keys")
    chosen = focused_testid(driver)
    press(driver, Keys.ENTER)
    seats.w.until(lambda d: seats.attr(chosen, "aria-pressed") == "true")
    # Each point list is a radio group: Tab enters it, arrow keys choose.
    for kind, point in (("boarding", trip.boarding), ("dropping", trip.dropping)):
        tab_to(driver, f"bus-{kind}-", prefix=True)
        press(driver, Keys.SPACE)
        for _ in range(30):
            if focused_testid(driver) == f"bus-{kind}-{point}":
                break
            press(driver, Keys.ARROW_DOWN)
        seats.w.until(lambda d, k=kind, p=point: seats.attr(f"bus-{k}-{p}", "data-selected") == "true")
    tab_to(driver, "bus-seats-continue")
    press(driver, Keys.ENTER)
    seats.wait_url("/buses/booking")
    BusTravellersPage(driver).visible("checkout-traveller-0-name")
    for test_id, text in (("checkout-traveller-0-name", "Amit Sharma"), ("checkout-traveller-0-age", "30")):
        tab_to(driver, test_id)
        press(driver, Keys.CONTROL, "a")
        press(driver, text)
    tab_to(driver, "checkout-traveller-0-gender-male")
    press(driver, Keys.SPACE)
    for test_id, text in (("checkout-contact-email", "amit@example.com"), ("checkout-contact-mobile", "9876543210")):
        tab_to(driver, test_id)
        press(driver, Keys.CONTROL, "a")
        press(driver, text)
    tab_to(driver, "checkout-travellers-continue")
    press(driver, Keys.ENTER)
    seats.wait_url("/buses/review?ref=")
    review = ReviewPage(driver).wait_loaded()
    tab_to(driver, "checkout-terms")
    press(driver, Keys.SPACE)
    review.w.until(lambda d: review.el("checkout-terms").is_selected())
    tab_to(driver, "checkout-proceed")
    press(driver, Keys.ENTER)
    review.wait_url("/buses/payment")
    pay = PaymentPage(driver).wait_loaded()
    tab_to(driver, "checkout-pay-method-upi")
    press(driver, Keys.SPACE)
    pay.w.until(lambda d: pay.el("checkout-pay-submit").is_enabled())
    tab_to(driver, "checkout-pay-submit")
    press(driver, Keys.ENTER)
    pay.wait_url("/buses/confirmation")
    ConfirmationPage(driver).wait_confirmed()
    traveller = ConfirmationPage(driver).body_text()
    assert "Amit Sharma" in traveller and "amit@example.com" in traveller


UNNAMED = """
  const named = (el) => {
    const label = (el.getAttribute('aria-label') || '').trim() || (el.title || '').trim();
    if (label) return true;
    const by = el.getAttribute('aria-labelledby');
    if (by && by.split(/\\s+/).some((id) => (document.getElementById(id)?.textContent || '').trim())) return true;
    if ((el.innerText || el.textContent || '').trim()) return true;
    return [...el.querySelectorAll('img[alt]')].some((i) => i.alt.trim());
  };
  return [...document.querySelectorAll('button, a[href], [role="button"]')]
    .filter((el) => el.getClientRects().length > 0 && !named(el))
    .map((el) => el.outerHTML.slice(0, 160));
"""


@pytest.mark.parametrize("path", ["/", "/buses", "/flights", "/hotels", "/login",
                                  f"/buses/search?from=PNQ&to=BOM&date={ist_date(95)}"])
def test_A11Y_06_icon_buttons_have_names(driver, path):
    page = Page(driver).open(path)
    settle(page)
    assert driver.execute_script(UNNAMED) == []


SMALL_TARGETS = """
  const out = [];
  const els = document.querySelectorAll(
    'button, [role="button"], [role="radio"], [role="tab"], select, textarea,'
    + ' input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), nav a[href]');
  for (const el of els) {
    // A search field's whole box is its tap target (its label covers it).
    const r = (el.tagName === 'INPUT' && el.closest('[data-field-shell]') || el).getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;               // visually hidden
    if (getComputedStyle(el).visibility === 'hidden') continue;
    if (Math.min(r.width, r.height) < 44 - 0.5) out.push(`${Math.round(r.width)}x${Math.round(r.height)} ${el.outerHTML.slice(0, 140)}`);
  }
  // A visually hidden radio/checkbox is tapped through its label.
  for (const el of document.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
    const box = el.closest('label') || el;
    const r = box.getBoundingClientRect();
    if (r.width < 4 && r.height < 4) continue;
    if (r.height < 44 - 0.5) out.push(`${Math.round(r.width)}x${Math.round(r.height)} ${box.outerHTML.slice(0, 140)}`);
  }
  return out.slice(0, 15);
"""


@pytest.mark.mobile
@pytest.mark.parametrize("path", ["/", "/buses", "/flights", "/hotels", "/login",
                                  f"/buses/search?from=PNQ&to=BOM&date={ist_date(96)}",
                                  f"/hotels/search?destinationId=city_GOI&checkIn={ist_date(96)}&checkOut={ist_date(98)}&rooms=2-0"])
def test_A11Y_07_touch_targets(driver, path):
    page = Page(driver).open(path)
    settle(page)
    assert driver.execute_script(SMALL_TARGETS) == []
