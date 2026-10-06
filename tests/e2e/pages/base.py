"""Page-object base: data-testid locators and explicit waits only (no sleeps, implicit wait 0)."""
from __future__ import annotations

from selenium.common.exceptions import StaleElementReferenceException, TimeoutException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

from tests.support import WEB_URL


def tid(value: str) -> tuple[str, str]:
    return (By.CSS_SELECTOR, f'[data-testid="{value}"]')


def tid_prefix(prefix: str) -> tuple[str, str]:
    return (By.CSS_SELECTOR, f'[data-testid^="{prefix}"]')


class Page:
    path = "/"

    def __init__(self, driver: WebDriver, timeout: float = 15):
        self.d = driver
        self.w = WebDriverWait(driver, timeout, ignored_exceptions=[StaleElementReferenceException])

    # ── navigation ──
    def open(self, path: str | None = None):
        self.d.get(WEB_URL + (path if path is not None else self.path))
        return self

    def wait_url(self, fragment: str, timeout: float = 15) -> str:
        WebDriverWait(self.d, timeout).until(lambda d: fragment in d.current_url)
        return self.d.current_url

    @property
    def path_and_query(self) -> str:
        url = self.d.current_url
        return url[len(WEB_URL):] if url.startswith(WEB_URL) else url

    # ── elements ──
    def el(self, test_id: str) -> WebElement:
        return self.w.until(EC.presence_of_element_located(tid(test_id)))

    def visible(self, test_id: str, timeout: float | None = None) -> WebElement:
        """The displayed element with this test id (layouts may render a hidden copy for the
        other breakpoint)."""
        w = WebDriverWait(self.d, timeout) if timeout else self.w

        def shown(d):
            for e in d.find_elements(*tid(test_id)):
                if e.is_displayed():
                    return e
            return False

        return w.until(shown)

    def all(self, prefix: str) -> list[WebElement]:
        return self.d.find_elements(*tid_prefix(prefix))

    def wait_all(self, prefix: str, min_count: int = 1) -> list[WebElement]:
        self.w.until(lambda d: len(d.find_elements(*tid_prefix(prefix))) >= min_count)
        return self.all(prefix)

    def exists(self, test_id: str) -> bool:
        return len(self.d.find_elements(*tid(test_id))) > 0

    def gone(self, test_id: str, timeout: float | None = None) -> None:
        w = WebDriverWait(self.d, timeout) if timeout else self.w
        w.until(EC.invisibility_of_element_located(tid(test_id)))

    # Scrolls the element (and any scrolling container) so its centre is not under a sticky or
    # fixed bar, as a user would before tapping it; true once nothing covers it.
    _UNCOVER = """
      const el = arguments[0];
      el.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      // Visually hidden inputs sit inside their label: the label is what gets tapped.
      if (top && (top === el || el.contains(top) || top.contains(el))) return true;
      let box = el.parentElement;
      while (box && box !== document.body) {
        if (box.scrollHeight > box.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(box).overflowY)) {
          box.scrollBy({top: r.height + 40, behavior: 'instant'}); break;
        }
        box = box.parentElement;
      }
      window.scrollBy({top: 120, behavior: 'instant'});
      return false;"""

    def click_el(self, el: WebElement) -> None:
        # A visually hidden radio/checkbox is operated through its label, as a person would.
        el = self.d.execute_script(
            "const e = arguments[0], r = e.getBoundingClientRect();"
            "return (r.width < 4 || r.height < 4) && e.closest('label') ? e.closest('label') : e;", el)
        self.w.until(lambda d: el.is_displayed() and el.is_enabled())
        self.w.until(lambda d: d.execute_script(self._UNCOVER, el))
        el.click()

    def double_click(self, el: WebElement) -> None:
        """A real double tap, after scrolling the target clear of sticky bars."""
        self.w.until(lambda d: el.is_displayed() and el.is_enabled())
        self.w.until(lambda d: d.execute_script(self._UNCOVER, el))
        ActionChains(self.d).double_click(el).perform()

    def click(self, test_id: str) -> WebElement:
        el = self.visible(test_id)
        self.click_el(el)
        return el

    def type(self, test_id: str, text: str, clear: bool = True) -> WebElement:
        el = self.visible(test_id)
        self.d.execute_script("arguments[0].scrollIntoView({block: 'center'})", el)
        if clear and el.get_attribute("value"):
            # el.clear() bypasses React's onChange; clear the way a person does.
            el.send_keys(Keys.CONTROL, "a")
            el.send_keys(Keys.BACKSPACE)
            self.w.until(lambda d: el.get_attribute("value") == "")
        el.send_keys(text)
        return el

    def set_value(self, test_id: str, value: str) -> None:
        """Sets an <input type=date> (keyboard entry is locale dependent) the way React sees it."""
        el = self.el(test_id)
        self.d.execute_script(
            "const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;"
            "s.call(arguments[0], arguments[1]);"
            "arguments[0].dispatchEvent(new Event('input', {bubbles: true}));"
            "arguments[0].dispatchEvent(new Event('change', {bubbles: true}));",
            el, value)

    def select(self, test_id: str, value: str) -> None:
        Select(self.visible(test_id)).select_by_value(value)

    def text(self, test_id: str) -> str:
        return self.visible(test_id).text.strip()

    def wait_text(self, test_id: str, expected: str, timeout: float | None = None) -> str:
        w = WebDriverWait(self.d, timeout) if timeout else self.w
        w.until(lambda d: expected in (d.find_element(*tid(test_id)).text or ""))
        return self.text(test_id)

    def attr(self, test_id: str, name: str) -> str | None:
        return self.el(test_id).get_attribute(name)

    # ── feedback ──
    def toast(self, kind: str = "success", timeout: float = 10) -> str:
        el = WebDriverWait(self.d, timeout).until(EC.visibility_of_element_located(tid(f"toast-{kind}")))
        return el.text.strip()

    def field_error(self, field: str) -> str:
        return self.text(f"field-error-{field}")

    def body_text(self) -> str:
        return self.d.find_element(By.TAG_NAME, "body").text

    def wait_body_text(self, text: str, timeout: float | None = None) -> None:
        w = WebDriverWait(self.d, timeout) if timeout else self.w
        w.until(lambda d: text in d.find_element(By.TAG_NAME, "body").text)

    def has_text(self, text: str, timeout: float = 5) -> bool:
        try:
            self.wait_body_text(text, timeout)
            return True
        except TimeoutException:
            return False
