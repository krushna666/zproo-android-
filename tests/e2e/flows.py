"""Multi-page journeys shared by the module suites (setup through the UI or the API)."""
from __future__ import annotations

from tests.e2e.conftest import sign_in
from tests.e2e.pages.bus import BusSeatsPage, BusTravellersPage, BusTrip
from tests.e2e.pages.checkout import ReviewPage
from tests.support import Api


def bus_to_review(driver, user, trip: BusTrip, seats: list[str] | None = None,
                  travellers: list[tuple[str, int, str]] | None = None) -> ReviewPage:
    """Signed in: seats → points → travellers → review (seats held)."""
    seats = seats or trip.seats
    sign_in(driver, user, f"/buses/{trip.trip_id}/seats")
    page = BusSeatsPage(driver).wait_loaded()
    page.select_seats(seats).choose_points(trip.boarding, trip.dropping).continue_()
    page.wait_url("/buses/booking")
    names = ["Amit Sharma", "Priya Sharma", "Kabir Sharma", "Neha Patil", "Rohan Patil", "Isha Rao"]
    BusTravellersPage(driver).fill(travellers or [(names[i], 30 + i, "MALE") for i in range(len(seats))]).continue_()
    page.wait_url("/buses/review?ref=")
    return ReviewPage(driver).wait_loaded()


def api_book_bus(api: Api, trip: BusTrip, seats: list[str] | None = None, **extra) -> dict:
    """Holds seats through the API (another customer, or test setup)."""
    seats = seats or trip.seats
    body = {
        "tripId": trip.trip_id, "seats": seats,
        "boardingPointId": trip.boarding, "droppingPointId": trip.dropping,
        "travellers": [{"seatNo": s, "name": "Ravi Kumar", "age": 40, "gender": "MALE"} for s in seats],
        "contact": {"email": "ravi@example.com", "mobile": "9876500000"},
        "expectedTotal": sum(trip.seat_prices.get(s, 0) for s in seats),
        **extra,
    }
    r = api.book("/buses/book", body)
    assert r.status_code == 201, r.text
    return r.json()["data"]


ADULT_NAMES = [("Amit", "Sharma"), ("Priya", "Sharma"), ("Kabir", "Sharma"), ("Neha", "Patil")]


def flight_to_review(driver, user, offer_id: str, return_id: str | None = None,
                     fare_id: str | None = None, pax: dict | None = None,
                     travellers: list | None = None) -> ReviewPage:
    """Signed in: fare page → travellers → review (seats held)."""
    from tests.e2e.pages.flight import FlightFaresPage, FlightTravellersPage

    sign_in(driver, user, f"/flights/offer/{offer_id}" + (f"?return={return_id}" if return_id else ""))
    fares = FlightFaresPage(driver).wait_loaded()
    if fare_id:
        fares.choose(fare_id)
    fares.continue_()
    fares.wait_url("/flights/booking")
    page = FlightTravellersPage(driver).wait_loaded()
    pax = pax or {"adults": 1, "children": 0, "infants": 0}
    page.fill(travellers or [(*ADULT_NAMES[i], "MALE", None) for i in range(pax["adults"])])
    page.continue_()
    page.wait_url("/flights/review?ref=")
    return ReviewPage(driver).wait_loaded()
