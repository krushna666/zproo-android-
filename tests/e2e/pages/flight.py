from __future__ import annotations

from dataclasses import dataclass

from selenium.webdriver.common.keys import Keys

from tests.support import Api, ist_date

from .base import Page

PAX_KEYS = ("adults", "children", "infants")


@dataclass
class FlightOffer:
    offer_id: str
    date: str
    fares: list[dict]
    pax: dict[str, int]


def flight_query(frm: str = "PNQ", to: str = "DEL", days: int = 10, adults: int = 1,
                 children: int = 0, infants: int = 0, return_days: int | None = None) -> dict:
    q = {"from": frm, "to": to, "date": ist_date(days), "adults": adults, "children": children,
         "infants": infants, "cabin": "ECONOMY"}
    if return_days is not None:
        q["returnDate"] = ist_date(return_days)
    return q


def find_flight(frm: str = "PNQ", to: str = "DEL", days: int = 10, stops: int | None = 0,
                skip: int = 0, **pax) -> FlightOffer:
    """An offer (through the API) for these travellers; `skip` picks a later one so parallel
    tests rarely share a flight."""
    api = Api()
    q = flight_query(frm, to, days, **pax)
    offers = api.get("/flights/search", params=q).json()["data"]["offers"]
    if stops is not None:
        offers = [o for o in offers if o["slices"][0]["stops"] == stops] or offers
    offer = offers[skip % len(offers)]
    detail = api.get(f"/flights/{offer['offerId']}").json()["data"]
    return FlightOffer(offer["offerId"], q["date"], detail["fareFamilies"],
                       {k: q[k] for k in PAX_KEYS})


class FlightSearchForm(Page):
    def trip(self, kind: str):
        self.click(f"flight-trip-{kind}")
        return self

    def choose_city(self, test_id: str, text: str):
        field = self.visible(test_id)
        self.d.execute_script("arguments[0].scrollIntoView({block: 'center'})", field)
        field.click()
        field.send_keys(text)
        self.w.until(lambda d: field.get_attribute("aria-expanded") == "true")
        field.send_keys(Keys.ENTER)
        return self

    def travellers(self, adults: int = 1, children: int = 0, infants: int = 0, done: bool = True):
        """Steps the counters from the defaults (1 adult) to these numbers."""
        self.click("flight-pax-open")
        for key, n, start in (("adults", adults, 1), ("children", children, 0), ("infants", infants, 0)):
            for _ in range(n - start):
                self.click(f"flight-pax-{key}-inc")
        if done:
            self.click("flight-pax-done")
        return self

    def search(self, frm: str | None = None, to: str | None = None, date: str | None = None,
               return_date: str | None = None):
        if frm:
            self.choose_city("flight-search-from", frm)
        if to:
            self.choose_city("flight-search-to", to)
        if date:
            self.set_value("flight-search-date", date)
        if return_date:
            self.set_value("flight-search-return", return_date)
        self.click("flight-search-submit")
        return self


class FlightResultsPage(Page):
    def open_search(self, q: dict, extra: str = ""):
        qs = "&".join(f"{k}={v}" for k, v in q.items())
        return self.open(f"/flights/search?{qs}{extra}")

    def wait_results(self):
        self.w.until(lambda d: self.all("flight-result-card-") or self.exists("flight-results-empty")
                     or self.exists("flight-results-error"))
        return self

    def cards(self):
        return [c for c in self.all("flight-result-card-") if c.is_displayed()]

    def values(self, attr: str) -> list[int]:
        return [int(c.get_attribute(attr) or 0) for c in self.cards()]


class FlightFaresPage(Page):
    def open_offer(self, offer_id: str, return_id: str | None = None):
        return self.open(f"/flights/offer/{offer_id}" + (f"?return={return_id}" if return_id else ""))

    def wait_loaded(self):
        self.visible("flight-fare-timer")
        return self

    def choose(self, fare_id: str):
        self.click(f"flight-fare-{fare_id}")
        self.w.until(lambda d: self.attr(f"flight-fare-{fare_id}", "aria-checked") == "true")
        return self

    def selected(self) -> list[str]:
        return [(e.get_attribute("data-testid") or "")[len("flight-fare-"):]
                for e in self.all("flight-fare-") if e.get_attribute("aria-checked") == "true"]

    def continue_(self):
        self.click("flight-continue")
        return self


class FlightTravellersPage(Page):
    def wait_loaded(self):
        self.visible("checkout-traveller-0-first-name")
        return self

    def fill_traveller(self, i: int, first: str, last: str, gender: str = "MALE",
                       dob: str | None = None):
        self.type(f"checkout-traveller-{i}-first-name", first)
        self.type(f"checkout-traveller-{i}-last-name", last)
        self.click(f"checkout-traveller-{i}-gender-{gender.lower()}")
        if dob:
            self.set_value(f"checkout-traveller-{i}-dob", dob)
        return self

    def fill(self, travellers: list[tuple[str, str, str, str | None]], email="amit@example.com",
             mobile="9876543210"):
        for i, (first, last, gender, dob) in enumerate(travellers):
            self.fill_traveller(i, first, last, gender, dob)
        self.type("checkout-contact-email", email)
        self.type("checkout-contact-mobile", mobile)
        return self

    def continue_(self):
        self.click("checkout-travellers-continue")
        return self
