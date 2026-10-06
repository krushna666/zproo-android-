from __future__ import annotations

from dataclasses import dataclass

from tests.support import Api, ist_date

from .base import Page


@dataclass
class BusTrip:
    trip_id: str
    date: str
    seats: list[str]
    seat_prices: dict[str, int]
    boarding: str
    dropping: str


def find_bus_trip(seats: int = 1, frm: str = "PNQ", to: str = "BOM", days: int = 7,
                  deck: str = "LOWER", skip: int = 0, two_decks: bool = False) -> BusTrip:
    """A trip (through the API) with `seats` open general seats on one deck, side by side in the
    seat map order. `skip` picks a later trip so parallel tests rarely share a coach."""
    api = Api()
    date = ist_date(days)
    trips = api.get("/buses/search", params={"from": frm, "to": to, "date": date}).json()["data"]["trips"]
    for t in trips[skip:] + trips[:skip]:
        m = api.get(f"/buses/{t['tripId']}/seats").json()["data"]
        if two_decks and len(m["decks"]) < 2:
            continue
        open_seats = [s for d in m["decks"] if d["deck"] == deck for s in d["seats"]
                      if s["status"] == "AVAILABLE" and not s["ladiesOnly"]]
        if len(open_seats) >= seats:
            detail = api.get(f"/buses/{t['tripId']}").json()["data"]
            chosen = open_seats[:seats]
            return BusTrip(t["tripId"], date, [s["seatNo"] for s in chosen],
                           {s["seatNo"]: s["price"] for s in chosen},
                           detail["boardingPoints"][0]["id"], detail["droppingPoints"][-1]["id"])
    raise AssertionError("no bus trip with enough open seats")


class BusSearchForm(Page):
    def search(self, frm: str | None = None, to: str | None = None, date: str | None = None):
        if frm:
            self.choose_city("bus-search-from", frm)
        if to:
            self.choose_city("bus-search-to", to)
        if date:
            self.set_value("bus-search-date", date)
        self.click("bus-search-submit")
        return self

    def choose_city(self, test_id: str, text: str):
        field = self.visible(test_id)
        self.d.execute_script("arguments[0].scrollIntoView({block: 'center'})", field)
        field.click()
        field.send_keys(text)
        self.w.until(lambda d: field.get_attribute("aria-expanded") == "true")
        from selenium.webdriver.common.keys import Keys
        field.send_keys(Keys.ENTER)
        return self


class BusResultsPage(Page):
    def open_search(self, frm: str, to: str, date: str, extra: str = ""):
        return self.open(f"/buses/search?from={frm}&to={to}&date={date}{extra}")

    def wait_results(self):
        self.w.until(lambda d: self.all("bus-result-card-") or self.exists("bus-results-empty")
                     or self.exists("bus-results-error"))
        return self

    def cards(self):
        return self.all("bus-result-card-")

    def values(self, attr: str) -> list[str]:
        return [c.get_attribute(attr) or "" for c in self.cards()]


class BusSeatsPage(Page):
    def open_trip(self, trip_id: str):
        return self.open(f"/buses/{trip_id}/seats")

    def wait_loaded(self):
        self.visible("bus-seats-continue")
        self.w.until(lambda d: self.all("bus-seat-"))
        return self

    def seat(self, seat_no: str):
        return self.el(f"bus-seat-{seat_no}")

    def select_seats(self, seats: list[str]):
        for s in seats:
            self.click(f"bus-seat-{s}")
            self.w.until(lambda d, s=s: self.seat(s).get_attribute("aria-pressed") == "true")
        return self

    def selected_seats(self) -> list[str]:
        self.w.until(lambda d: any(e.get_attribute("data-status") == "SELECTED" for e in self.all("bus-seat-")))
        return sorted((e.get_attribute("data-testid") or "")[len("bus-seat-"):]
                      for e in self.all("bus-seat-") if e.get_attribute("data-status") == "SELECTED")

    def choose_points(self, boarding: str | None, dropping: str | None):
        if boarding:
            self.click(f"bus-boarding-{boarding}")
            self.w.until(lambda d: self.attr(f"bus-boarding-{boarding}", "data-selected") == "true")
        if dropping:
            self.click(f"bus-dropping-{dropping}")
            self.w.until(lambda d: self.attr(f"bus-dropping-{dropping}", "data-selected") == "true")
        return self

    def continue_(self):
        self.click("bus-seats-continue")
        return self


class BusTravellersPage(Page):
    def fill(self, travellers: list[tuple[str, int, str]], email="amit@example.com", mobile="9876543210"):
        for i, (name, age, gender) in enumerate(travellers):
            self.type(f"checkout-traveller-{i}-name", name)
            self.type(f"checkout-traveller-{i}-age", str(age))
            self.click(f"checkout-traveller-{i}-gender-{gender.lower()}")
        self.type("checkout-contact-email", email)
        self.type("checkout-contact-mobile", mobile)
        return self

    def continue_(self):
        self.click("checkout-travellers-continue")
        return self
