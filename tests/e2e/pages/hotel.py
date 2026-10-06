from __future__ import annotations

from dataclasses import dataclass

from selenium.webdriver.common.keys import Keys

from tests.support import Api, ist_date

from .base import Page


@dataclass
class HotelStay:
    hotel_id: str
    check_in: str
    check_out: str
    rooms: str  # "2-0|1-1:5" as in the URL

    @property
    def query(self) -> str:
        return f"checkIn={self.check_in}&checkOut={self.check_out}&rooms={self.rooms.replace('|', '%7C')}"

    @property
    def details_path(self) -> str:
        return f"/hotels/{self.hotel_id}?{self.query}"


def find_rate(hotel_id: str, days: int, nights: int = 2, rooms: str = "2-0", count: int = 1,
              refundable: bool | None = None, max_adults: int | None = None) -> tuple[HotelStay, list[str]]:
    """A stay at `hotel_id` and `count` rate ids (one per searched room, same room type) that fit
    the guests; `refundable`/`max_adults` narrow the choice."""
    stay = HotelStay(hotel_id, ist_date(days), ist_date(days + nights), rooms)
    data = Api().get(f"/hotels/{hotel_id}/rooms", params={
        "checkIn": stay.check_in, "checkOut": stay.check_out, "rooms": rooms}).json()["data"]
    for rt in data["roomTypes"]:
        if max_adults is not None and rt["maxAdults"] != max_adults:
            continue
        for rate in rt["rates"]:
            if refundable is not None and rate["refundable"] != refundable:
                continue
            if rate["roomsLeft"] >= count:
                return stay, [rate["rateId"]] * count
    raise AssertionError(f"no matching rate at {hotel_id}")


class HotelSearchForm(Page):
    def choose_destination(self, text: str):
        field = self.visible("hotel-search-destination")
        self.d.execute_script("arguments[0].scrollIntoView({block: 'center'})", field)
        field.click()
        field.send_keys(Keys.CONTROL, "a")
        field.send_keys(text)
        self.w.until(lambda d: field.get_attribute("aria-expanded") == "true")
        field.send_keys(Keys.ENTER)
        return self

    def dates(self, check_in: str | None = None, check_out: str | None = None):
        if check_in:
            self.set_value("hotel-search-checkin", check_in)
        if check_out:
            self.set_value("hotel-search-checkout", check_out)
        return self

    def submit(self):
        self.click("hotel-search-submit")
        return self


class HotelResultsPage(Page):
    def open_search(self, destination: str, check_in: str, check_out: str, rooms: str = "2-0",
                    extra: str = ""):
        return self.open(f"/hotels/search?destinationId={destination}&checkIn={check_in}"
                         f"&checkOut={check_out}&rooms={rooms.replace('|', '%7C')}{extra}")

    def wait_results(self):
        self.w.until(lambda d: self.cards() or self.exists("hotel-results-empty")
                     or self.exists("hotel-results-error"))
        return self

    def cards(self):
        return [c for c in self.all("hotel-result-card-") if c.is_displayed()]


class HotelDetailsPage(Page):
    def open_stay(self, stay: HotelStay):
        return self.open(stay.details_path)

    def wait_loaded(self):
        self.visible("hotel-reserve")
        self.w.until(lambda d: self.all("hotel-room-select-"))
        return self

    def select_rates(self, rate_ids: list[str]):
        """Fills the searched rooms in order (the page moves on to the next empty room)."""
        for n, rate in enumerate(rate_ids, start=1):
            if len(rate_ids) > 1:
                self.click(f"hotel-assign-room-{n}")
            self.click(f"hotel-room-select-{rate}")
            # The page moves on to the next empty room, so count the rooms chosen.
            self.w.until(lambda d, n=n: self.text("hotel-rooms-selected").startswith(f"{n} of"))
        return self

    def reserve(self):
        self.w.until(lambda d: self.el("hotel-reserve").is_enabled())
        self.click("hotel-reserve")
        return self


class HotelGuestsPage(Page):
    def wait_loaded(self):
        self.visible("checkout-traveller-0-first-name")
        return self

    def fill(self, guests: list[tuple[str, str]], email="amit@example.com", mobile="9876543210",
             requests: str | None = None):
        for i, (first, last) in enumerate(guests):
            self.type(f"checkout-traveller-{i}-first-name", first)
            self.type(f"checkout-traveller-{i}-last-name", last)
        self.type("checkout-contact-email", email)
        self.type("checkout-contact-mobile", mobile)
        if requests is not None:
            self.type("checkout-special-requests", requests)
        return self

    def continue_(self):
        self.click("checkout-travellers-continue")
        return self
