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
