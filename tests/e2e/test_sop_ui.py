"""SOP-01…12: UI style SOP compliance, read from computed styles (Prompt 00 §2, Prompt 04 §4.5)."""
from __future__ import annotations

import pytest

from tests.e2e.conftest import set_scenario, sign_in
from tests.e2e.pages.auth import LoginPage
from tests.e2e.pages.base import Page
from tests.e2e.pages.flight import flight_query
from tests.support import ist_date

pytestmark = pytest.mark.sop

PRIMARY = "rgb(217, 20, 30)"
DANGER = "rgb(220, 38, 38)"
FORBIDDEN = ["#E31118", "#D91E2A", "#E50920", "#FF4B55", "#B3141F", "#A80F1A"]

MAIN_PAGES = [
    "/",
    "/login",
    "/buses",
    "/flights",
    "/hotels",
    f"/buses/search?from=PNQ&to=BOM&date={ist_date(80)}",
    "/flights/search?" + "&".join(f"{k}={v}" for k, v in flight_query(days=80).items()),
    f"/hotels/search?destinationId=city_GOI&checkIn={ist_date(80)}&checkOut={ist_date(82)}&rooms=2-0",
]


def rgb(hex_: str) -> str:
    h = hex_.lstrip("#")
    return f"rgb({int(h[0:2], 16)}, {int(h[2:4], 16)}, {int(h[4:6], 16)})"


def style(driver, el, prop: str) -> str:
    return driver.execute_script("return getComputedStyle(arguments[0]).getPropertyValue(arguments[1])", el, prop)


def settle(page: Page) -> None:
    page.w.until(lambda d: d.execute_script("return document.readyState") == "complete"
                 and not d.find_elements("css selector", '[aria-busy="true"], [data-testid$="-loading"]'))


@pytest.mark.parametrize("path,button", [("/buses", "bus-search-submit"), ("/flights", "flight-search-submit"),
                                         ("/hotels", "hotel-search-submit"), ("/login", "auth-submit")])
def test_SOP_01_primary_buttons(driver, path, button):
    page = Page(driver).open(path)
    assert style(driver, page.visible(button), "background-color") == PRIMARY


@pytest.mark.parametrize("path", MAIN_PAGES)
def test_SOP_02_no_forbidden_reds(driver, path):
    page = Page(driver).open(path)
    settle(page)
    found = driver.execute_script("""
        const bad = new Set(arguments[0]);
        const props = ['color', 'background-color', 'border-top-color', 'border-right-color',
                       'border-bottom-color', 'border-left-color', 'outline-color', 'fill', 'stroke'];
        const hits = [];
        for (const el of document.querySelectorAll('*')) {
          const cs = getComputedStyle(el);
          for (const p of props) {
            if (bad.has(cs.getPropertyValue(p))) hits.push(`${el.tagName}.${el.className} ${p}`);
          }
        }
        return hits.slice(0, 10);""", [rgb(h) for h in FORBIDDEN])
    assert found == []


@pytest.mark.parametrize("path", ["/", "/buses", "/login"])
def test_SOP_03_font_family(driver, path):
    page = Page(driver).open(path)
    settle(page)
    for selector in ("body", "h1", "button"):
        el = driver.find_element("css selector", selector)
        family = style(driver, el, "font-family")
        assert family.split(",")[0].strip().strip('"') == "Plus Jakarta Sans", (selector, family)


def test_SOP_04_input_and_card_radius(driver):
    page = LoginPage(driver).open().wait_loaded()
    page.use("email")
    assert style(driver, page.visible("auth-email"), "border-radius") == "12px"
    page.open(f"/buses/search?from=PNQ&to=BOM&date={ist_date(81)}")
    card = page.wait_all("bus-result-card-")[0]
    assert style(driver, card, "border-radius") == "14px"


@pytest.mark.parametrize("button", ["bus-search-submit", "bus-search-swap"])
def test_SOP_05_buttons_are_pills(driver, button):
    page = Page(driver).open("/buses")
    el = page.visible(button)
    radius = float(style(driver, el, "border-top-left-radius").rstrip("px"))
    assert radius >= el.size["height"] / 2


def test_SOP_06_field_error(driver):
    page = LoginPage(driver).open().wait_loaded()
    page.use("email")
    page.click("auth-submit")
    error = page.visible("field-error-identifier")
    assert style(driver, error, "font-size") == "12px"
    assert style(driver, error, "color") == DANGER
    assert page.attr("auth-email", "aria-invalid") == "true"


def test_SOP_07_toast_position_and_lifetime(driver):
    page = LoginPage(driver).open().wait_loaded()
    page.use("email")
    # Time the toast inside the page: from its first paint to its removal.
    driver.execute_script("""
        window.__toast = {};
        new MutationObserver(() => {
          const t = document.querySelector('[data-testid^="toast-"]');
          if (t && !window.__toast.shown) {
            window.__toast.shown = performance.now();
            const r = t.getBoundingClientRect();
            window.__toast.rect = {left: r.left, right: r.right, top: r.top, width: innerWidth};
          }
          if (!t && window.__toast.shown && !window.__toast.gone) window.__toast.gone = performance.now();
        }).observe(document.body, {childList: true, subtree: true});""")
    page.click("auth-submit")
    page.toast("error")
    page.w.until(lambda d: d.execute_script("return !!window.__toast.gone"))
    t = driver.execute_script("return window.__toast")
    centre = (t["rect"]["left"] + t["rect"]["right"]) / 2
    assert abs(centre - t["rect"]["width"] / 2) <= 2
    assert t["rect"]["top"] <= 40
    assert 2800 <= t["gone"] - t["shown"] <= 3600


@pytest.mark.parametrize("path,title", [
    ("/login", "Log in | ZPROO GO"),
    ("/signup", "Sign up | ZPROO GO"),
    ("/forgot-password", "Forgot password | ZPROO GO"),
    ("/buses", "Bus tickets | ZPROO GO"),
    ("/flights", "Flights | ZPROO GO"),
    ("/hotels", "Hotels | ZPROO GO"),
    (f"/buses/search?from=PNQ&to=BOM&date={ist_date(82)}", "Buses from Pune to Mumbai | ZPROO GO"),
    ("/flights/search?" + "&".join(f"{k}={v}" for k, v in flight_query(days=82).items()),
     "Flights from Pune to New Delhi | ZPROO GO"),
    (f"/hotels/search?destinationId=city_GOI&checkIn={ist_date(82)}&checkOut={ist_date(84)}&rooms=2-0",
     "Hotels in Goa | ZPROO GO"),
    ("/no-such-page", "Page not found | ZPROO GO"),
])
def test_SOP_08_page_titles(driver, path, title):
    Page(driver).open(path)
    Page(driver).w.until(lambda d: d.title == title)


def test_SOP_08_signed_in_titles(driver, user):
    sign_in(driver, user, "/bookings")
    page = Page(driver)
    page.w.until(lambda d: d.title == "My bookings | ZPROO GO")
    page.open("/profile")
    page.w.until(lambda d: d.title == "My profile | ZPROO GO")


def test_SOP_09_theme_color(driver):
    Page(driver).open("/")
    meta = driver.find_element("css selector", 'meta[name="theme-color"]')
    assert meta.get_attribute("content") == "#D9141E"


def test_SOP_10_loading_text(driver):
    page = Page(driver).open("/robots.txt")
    set_scenario(driver, "slow")
    page.open("/flights/search?" + "&".join(f"{k}={v}" for k, v in flight_query(days=83).items()))
    count = page.visible("flight-results-count")
    page.w.until(lambda d: count.text.strip() != "")
    # The supplier is slow in this scenario, so the loading copy is what shows first.
    assert count.text.strip() == "Searching..."


def test_SOP_11_reduced_motion(driver):
    driver.execute_cdp_cmd("Emulation.setEmulatedMedia",
                           {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]})
    page = LoginPage(driver).open().wait_loaded()
    page.use("email")
    page.click("auth-submit")
    toast = page.visible("toast-error")
    assert style(driver, toast, "animation-name") == "none" or style(driver, toast, "animation-duration") == "0s"
    assert style(driver, toast, "transition-duration") in ("0s", "")


def test_SOP_12_header_and_bottom_nav_height(driver, viewport):
    page = Page(driver).open("/")
    settle(page)
    header = page.visible("site-header")
    # The header bar (logo, search, account) is 64px; on desktop the service tabs sit below it.
    bar = header.find_element("css selector", ":scope > div")
    assert round(bar.size["height"]) == 64
    if viewport == "mobile":
        nav = driver.find_element("css selector", 'nav[aria-label="Primary"] ul')
        assert round(nav.size["height"]) == 64
