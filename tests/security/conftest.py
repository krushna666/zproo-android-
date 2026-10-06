"""Fixtures for the API security suite (requests only; no browser)."""
from __future__ import annotations

import os
import shutil
import signal
import subprocess
from pathlib import Path

import pytest
import requests
from selenium.webdriver.support.ui import WebDriverWait

from tests.support import Api, TestUser

ROOT = Path(__file__).resolve().parents[2]
# One production-mode API per xdist worker (gw0 → 5199, gw1 → 5200, …), each on its own Redis db.
WORKER = int(os.environ.get("PYTEST_XDIST_WORKER", "gw0")[2:] or 0)
PROD_PORT = int(os.environ.get("E2E_PROD_PORT", "5199")) + WORKER


@pytest.fixture
def user() -> TestUser:
    return Api.create_user()


@pytest.fixture
def user_api(user) -> Api:
    return Api.as_user(user)


@pytest.fixture
def other_api() -> Api:
    return Api.as_user(Api.create_user())


@pytest.fixture(scope="session")
def production_api():
    """The API with NODE_ENV=production behaviour (apps/api/test/support/productionServer.ts),
    on its own port and Redis database, for SEC-13/14."""
    url = f"http://localhost:{PROD_PORT}/api"
    env = {
        **os.environ,
        "PORT": str(PROD_PORT),
        "DATABASE_URL": os.environ.get("E2E_DATABASE_URL", "postgresql://zproo:zproo@localhost:5432/zproo_e2e"),
        "REDIS_URL": os.environ.get("E2E_PROD_REDIS_URL", f"redis://localhost:6379/{6 + WORKER}"),
        "JWT_SECRET": "prod-probe-access-secret-0123456789",
        "JWT_REFRESH_SECRET": "prod-probe-refresh-secret-0123456789",
        "FRONTEND_URL": "http://localhost:4300",
        "LOG_LEVEL": "warn",
    }
    env["DIRECT_DATABASE_URL"] = env["DATABASE_URL"]
    log = open(ROOT / "tests" / "security" / f"production-api-{WORKER}.log", "w")
    proc = subprocess.Popen([shutil.which("npx") or "npx", "tsx", "test/support/productionServer.ts"],
                            cwd=ROOT / "apps" / "api", env=env, stdout=log, stderr=subprocess.STDOUT,
                            start_new_session=True)

    def ready(_) -> bool:
        if proc.poll() is not None:
            raise RuntimeError(f"production-mode API exited; see {log.name}")
        try:
            return requests.get(f"{url}/health/ready", timeout=2).status_code == 200
        except requests.RequestException:
            return False

    WebDriverWait(None, 60, poll_frequency=0.5).until(ready, f"production-mode API not ready; see {log.name}")
    yield url
    os.killpg(proc.pid, signal.SIGTERM)
    proc.wait(timeout=15)
    log.close()
