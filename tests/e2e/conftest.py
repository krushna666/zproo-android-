"""Fixtures for the Selenium suite: a fresh browser per test (desktop 1366×900 or mobile 390×844
emulation), a test user per test created through the API, and evidence saved on failure."""
from __future__ import annotations

import json
import os
import re
import uuid
from pathlib import Path

import pytest
import requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service

from tests.support import API_URL, CSRF, WEB_URL, Api, TestUser

ARTIFACTS = Path(__file__).parent / "artifacts"


def pytest_addoption(parser):
    parser.addoption("--viewport", default=os.environ.get("E2E_VIEWPORT", "desktop"),
                     choices=["desktop", "mobile"], help="desktop 1366×900 or mobile 390×844")


def pytest_configure(config):
    config.addinivalue_line("markers", "viewport: set by --viewport")


def pytest_collection_modifyitems(config, items):
    viewport = config.getoption("--viewport")
    skip_other = pytest.mark.skip(reason=f"not part of the {viewport} run")
    for item in items:
        if viewport == "desktop" and "mobile" in item.keywords:
            item.add_marker(skip_other)
        if viewport == "mobile" and "desktop" in item.keywords:
            item.add_marker(skip_other)


def pytest_sessionstart(session):
    # Controller only (not each xdist worker): wipe customer data and rate-limit counters once.
    if hasattr(session.config, "workerinput"):
        return
    requests.post(f"{API_URL}/test/reset", timeout=30).raise_for_status()


@pytest.fixture(scope="session")
def viewport(pytestconfig) -> str:
    return pytestconfig.getoption("--viewport")


def _chrome_options(viewport: str) -> webdriver.ChromeOptions:
    o = webdriver.ChromeOptions()
    if os.environ.get("CHROME_BIN"):
        o.binary_location = os.environ["CHROME_BIN"]
    for arg in ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
                "--lang=en-IN", "--disable-search-engine-choice-screen",
                "--disable-background-networking", "--disable-component-update", "--no-first-run"]:
        o.add_argument(arg)
    if viewport == "mobile":
        o.add_experimental_option("mobileEmulation", {
            "deviceMetrics": {"width": 390, "height": 844, "pixelRatio": 3.0, "touch": True},
            "userAgent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
                         "(KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36",
        })
    else:
        o.add_argument("--window-size=1366,900")
    o.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    o.add_experimental_option("prefs", {"download.default_directory": "/tmp/zproo-e2e-downloads"})
    return o


@pytest.fixture
def driver(viewport, request):
    service = Service(os.environ["CHROMEDRIVER"]) if os.environ.get("CHROMEDRIVER") else Service()
    d = webdriver.Chrome(options=_chrome_options(viewport), service=service)
    d.implicitly_wait(0)
    d.set_page_load_timeout(60)
    request.node._driver = d
    yield d
    d.quit()


@pytest.fixture
def api(request) -> Api:
    a = Api()
    request.node._apis = getattr(request.node, "_apis", []) + [a]
    return a


@pytest.fixture
def user(request) -> TestUser:
    """A fresh customer (each test has its own data; no test depends on another)."""
    return Api.create_user(fullName="Amit Sharma", email=f"amit.{uuid.uuid4().hex[:10]}@example.com",
                           password="secret123")


@pytest.fixture
def user_api(user, request) -> Api:
    a = Api.as_user(user)
    request.node._apis = getattr(request.node, "_apis", []) + [a]
    return a


def sign_in(driver, user: TestUser, path: str = "/") -> None:
    """Gives the browser the user's session (refresh + CSRF cookies), then opens `path`; the app
    restores the session on load like after a real sign-in."""
    driver.get(f"{WEB_URL}/robots.txt")
    # Through CDP: WebDriver's add_cookie can't set an httpOnly cookie on another path.
    for name, value, path_, http_only in (("zp_rt", user.refresh_token, "/api/auth", True),
                                         ("zp_csrf", CSRF, "/", False)):
        driver.execute_cdp_cmd("Network.setCookie", {
            "name": name, "value": value, "url": WEB_URL + path_, "path": path_,
            "httpOnly": http_only, "sameSite": "Strict"})
    # The app restores a session on load only in a browser that has signed in before.
    driver.execute_script("localStorage.setItem('zproo.hasSession', '1')")
    driver.get(WEB_URL + path)


def set_scenario(driver, scenario: str | None) -> None:
    """Forces a supplier behaviour (X-Mock-Scenario) for the browser's API calls."""
    if not driver.current_url.startswith(WEB_URL):
        driver.get(f"{WEB_URL}/robots.txt")
    if scenario:
        driver.add_cookie({"name": "zproo_mock_scenario", "value": scenario, "path": "/"})
    else:
        driver.delete_cookie("zproo_mock_scenario")


def set_clock(driver, offset_ms: int) -> None:
    """Moves the app clock (and the API's, through X-Test-Now) by `offset_ms`."""
    if not driver.current_url.startswith(WEB_URL):
        driver.get(f"{WEB_URL}/robots.txt")
    driver.add_cookie({"name": "zproo_clock_offset_ms", "value": str(offset_ms), "path": "/"})


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.when != "call" or not report.failed:
        return
    folder = ARTIFACTS / re.sub(r"[^A-Za-z0-9_.-]+", "_", item.nodeid)
    folder.mkdir(parents=True, exist_ok=True)
    d = getattr(item, "_driver", None)
    if d is not None:
        try:
            d.save_screenshot(str(folder / "screenshot.png"))
            (folder / "page.html").write_text(d.page_source, encoding="utf-8")
            (folder / "url.txt").write_text(d.current_url)
            logs = d.get_log("browser")
            (folder / "console.json").write_text(json.dumps(logs, indent=2))
        except Exception as exc:  # noqa: BLE001 - evidence is best effort
            (folder / "evidence-error.txt").write_text(repr(exc))
    apis = getattr(item, "_apis", [])
    if apis:
        (folder / "api.txt").write_text("\n".join(line for a in apis for line in a.last))
