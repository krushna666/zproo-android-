"""HTL-01…16: search, filters, details, rooms, checkout and scenarios (Prompt 04 §4.4).
Each test books its own hotel and dates, so parallel tests never compete for the same rooms."""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from selenium.common.exceptions import NoAlertPresentException
from selenium.webdriver.common.keys import Keys

from tests.e2e.conftest import set_scenario, sign_in
from tests.e2e.pages.auth import LoginPage
from tests.e2e.pages.base import Page
from tests.e2e.pages.checkout import BookingsPage, ConfirmationPage, PaymentPage, ReviewPage
from tests.e2e.pages.hotel import (HotelDetailsPage, HotelGuestsPage, HotelResultsPage,
                                   HotelSearchForm, find_rate)
from tests.support import ist_date, today_ist

pytestmark = pytest.mark.hotel


def to_guests(driver, user, stay, rates) -> HotelGuestsPage:
    sign_in(driver, user, stay.details_path)
    HotelDetailsPage(driver).wait_loaded().select_rates(rates).reserve()
    page = HotelGuestsPage(driver)
    page.wait_url("/hotels/booking")
    return page.wait_loaded()


def to_review(driver, user, stay, rates, requests: str | None = None) -> ReviewPage:
    guests = to_guests(driver, user, stay, rates)
    names = [("Amit", "Sharma"), ("Priya", "Sharma"), ("Kabir", "Sharma")]
    guests.fill(names[: len(rates)], requests=requests).continue_()
    guests.wait_url("/hotels/review?ref=")
    return ReviewPage(driver).wait_loaded()


def pay(driver, review) -> ConfirmationPage:
    review.accept_and_proceed()
    review.wait_url("/hotels/payment")
    PaymentPage(driver).wait_loaded().pay()
    review.wait_url("/hotels/confirmation")
    return ConfirmationPage(driver).wait_confirmed()


def no_alert(driver) -> bool:
    try:
        driver.switch_to.alert
        return False
    except NoAlertPresentException:
        return True


@pytest.mark.smoke
def test_HTL_01_search(driver):
    page = Page(driver).open("/hotels")
    form = HotelSearchForm(driver)
    form.choose_destination("Goa").dates(ist_date(50), ist_date(53)).submit()
    page.wait_url(f"checkIn={ist_date(50)}&checkOut={ist_date(53)}")
    assert "rooms=2-0" in driver.current_url
    results = HotelResultsPage(driver).wait_results()
    cards = results.cards()
    assert cards
    for card in cards[:5]:
        assert "per night" in card.text and "total for 3 nights" in card.text


def test_HTL_02_check_out_same_day(driver):
    page = Page(driver).open("/hotels")
    HotelSearchForm(driver).dates(ist_date(51), ist_date(51)).submit()
    page.wait_body_text("Check-out must be after check-in")
    assert "/hotels/search" not in driver.current_url


def test_HTL_03_thirty_nights_max(driver):
    page = Page(driver).open("/hotels")
    HotelSearchForm(driver).dates(ist_date(52), ist_date(52 + 31)).submit()
    page.wait_body_text("You can book up to 30 nights at a time")
    assert "/hotels/search" not in driver.current_url


def test_HTL_04_child_age_required(driver):
    page = Page(driver).open("/hotels")
    form = HotelSearchForm(driver)
    form.click("hotel-guests-open")
    form.click("hotel-room-1-children-inc")
    form.visible("hotel-room-1-child-1-age")
    form.click("hotel-guests-done")
    form.submit()
    page.wait_body_text("Add the age of each child")
    assert "/hotels/search" not in driver.current_url


def test_HTL_05_eight_rooms_max(driver):
    page = Page(driver).open("/hotels")
    form = HotelSearchForm(driver)
    form.click("hotel-guests-open")
    for _ in range(7):
        form.click("hotel-add-room")
    assert not form.el("hotel-add-room").is_enabled()
    # A deep link asking for nine rooms is refused with the same rule.
    results = HotelResultsPage(driver).open_search("city_GOI", ist_date(54), ist_date(55), "|".join(["1-0"] * 9))
    error = results.visible("hotel-results-error")
    assert "You can book up to 8 rooms at a time" in error.text


def test_HTL_06_filters(driver, viewport):
    results = HotelResultsPage(driver).open_search("city_GOI", ist_date(55), ist_date(57)).wait_results()
    if viewport == "mobile":
        results.click("hotel-filters-open")
    for f in ("hotel-filter-stars-4", "hotel-filter-free-cancellation", "hotel-filter-amenity-pool"):
        results.click(f)
    if viewport == "mobile":
        results.click("hotel-filters-apply")
    results.wait_url("amenities=pool")
    results.w.until(lambda d: results.cards() and all(
        c.get_attribute("data-stars") == "4" and c.get_attribute("data-free-cancellation") == "true"
        and "pool" in (c.get_attribute("data-amenities") or "").split(",") for c in results.cards()))


def test_HTL_07_sort_price(driver):
    results = HotelResultsPage(driver).open_search("city_GOI", ist_date(56), ist_date(58)).wait_results()
    results.click("hotel-sort-price_asc")
    results.wait_url("sort=price_asc")
    results.w.until(lambda d: (v := [int(c.get_attribute("data-price")) for c in results.cards()])
                    == sorted(v) and len(v) > 1)


def test_HTL_08_gallery_lightbox(driver):
    stay, _ = find_rate("htl_GOI010", 57)
    page = HotelDetailsPage(driver).open_stay(stay).wait_loaded()
    opener = page.click("hotel-gallery-open")
    box = page.visible("hotel-lightbox")
    count = box.text.split(" / ")[-1].split()[0]
    page.w.until(lambda d: f"1 / {count}" in page.text("hotel-lightbox"))
    box.send_keys(Keys.ARROW_RIGHT)
    page.w.until(lambda d: f"2 / {count}" in page.text("hotel-lightbox"))
    driver.switch_to.active_element.send_keys(Keys.ARROW_LEFT)
    page.w.until(lambda d: f"1 / {count}" in page.text("hotel-lightbox"))
    driver.switch_to.active_element.send_keys(Keys.ESCAPE)
    page.gone("hotel-lightbox")
    page.w.until(lambda d: d.switch_to.active_element == opener)


def test_HTL_09_occupancy_over_room_max(driver):
    stay, _ = find_rate("htl_GOI002", 58, rooms="4-0", max_adults=4)
    page = HotelDetailsPage(driver).open_stay(stay).wait_loaded()
    small = page.visible("hotel-room-type-rt_GOI002_1")
    assert "This room fits up to 3 adults" in small.text
    assert not page.el("hotel-room-select-rate_GOI002_1_hb").is_enabled()


@pytest.mark.smoke
def test_HTL_10_multi_room_happy_path(driver, user, user_api):
    stay, rates = find_rate("htl_GOI003", 59, rooms="2-0|2-0", count=2, refundable=True)
    review = to_review(driver, user, stay, rates)
    confirm = pay(driver, review)
    ref = confirm.reference()
    assert confirm.pnr()  # the hotel's confirmation number
    booking = user_api.get(f"/bookings/{ref}").json()["data"]
    assert booking["status"] == "CONFIRMED" and len(booking["hotel"]["rooms"]) == 2
    pdf = user_api.get(f"/bookings/{ref}/ticket.pdf")
    assert pdf.status_code == 200 and pdf.headers["content-type"].startswith("application/pdf")


def test_HTL_11_room_sold_out(driver, user):
    stay, rates = find_rate("htl_GOI004", 60)
    guests = to_guests(driver, user, stay, rates)
    guests.fill([("Amit", "Sharma")])
    set_scenario(driver, "room_sold_out")
    guests.continue_()
    guests.wait_body_text("This room just sold out. Please choose another room.")
    set_scenario(driver, None)
    guests.click("hotel-choose-another")
    details = HotelDetailsPage(driver)
    details.wait_url(f"/hotels/{stay.hotel_id}")
    details.wait_loaded()


def test_HTL_12_price_changed(driver, user):
    stay, rates = find_rate("htl_GOI005", 61)
    guests = to_guests(driver, user, stay, rates)
    guests.fill([("Amit", "Sharma")])
    set_scenario(driver, "price_changed")
    guests.continue_()
    dialog = guests.visible("dialog-price-changed")
    assert "₹" in dialog.text
    guests.click("dialog-price-continue")
    guests.wait_url("/hotels/review?ref=")


def test_HTL_13_xss_in_special_requests(driver, user, user_api):
    """Markup is stripped on the server (P03: plain text); what remains, quotes and angle
    brackets included, is shown as literal text and never runs."""
    stay, rates = find_rate("htl_GOI006", 62)
    payload = 'Late check-in <img src=x onerror=alert(1)>& high floor <script>alert(2)</script>"><b>x</b> 2 < 3'
    review = to_review(driver, user, stay, rates, requests=payload)
    ref = driver.current_url.split("ref=")[1]
    stored = user_api.get(f"/bookings/{ref}").json()["data"]["hotel"]["specialRequests"]
    assert stored.startswith("Late check-in") and '">' in stored and "2 < 3" in stored
    assert "<img" not in stored and "<script" not in stored
    assert review.text("hotel-special-requests") == stored
    assert no_alert(driver)
    assert not driver.execute_script("return document.querySelector('img[src=\"x\"]')")
    confirm = pay(driver, review)
    assert confirm.text("hotel-special-requests") == stored
    assert no_alert(driver)


def test_HTL_14_non_refundable_cancel(driver, user):
    stay, rates = find_rate("htl_GOI007", 63, refundable=False)
    review = to_review(driver, user, stay, rates)
    ref = pay(driver, review).reference()
    bookings = BookingsPage(driver).open()
    bookings.visible(f"booking-{ref}")
    bookings.click("booking-cancel")
    assert bookings.text("booking-refund-amount") == "₹0"


def test_HTL_15_new_year_nights(driver):
    today = today_ist().date()
    dec30 = date(today.year, 12, 30)
    if dec30 <= today:
        dec30 = date(today.year + 1, 12, 30)
    page = Page(driver).open("/hotels")
    HotelSearchForm(driver).dates(dec30.isoformat(), (dec30 + timedelta(days=3)).isoformat())
    page.wait_text("hotel-nights", "3 nights")


def test_HTL_16_deep_login_from_room_selection(driver, user):
    stay, rates = find_rate("htl_GOI001", 64, rooms="2-0|1-0", count=2)
    page = HotelDetailsPage(driver).open_stay(stay).wait_loaded()
    page.select_rates(rates).reserve()
    page.wait_url("/login?returnTo=")
    LoginPage(driver).wait_loaded().login_email(user.email, "secret123")
    page.wait_url(f"/hotels/{stay.hotel_id}")
    page.wait_loaded()
    page.w.until(lambda d: page.attr(f"hotel-room-select-{rates[0]}", "aria-pressed") == "true")
    assert page.el("hotel-reserve").is_enabled()
