# End-to-end and security suites (Prompt 04). Unit/API tests: `npm run test`.
#
#   make e2e          local Postgres + Redis: migrate, seed, start, wait, run everything, stop
#   make e2e-docker   the same against docker-compose.test.yml
#   make e2e-stack / e2e-run ARGS="tests/e2e/test_bus.py" / e2e-stop   step by step
#
# Needs Python 3.12 with tests/requirements.txt, Chrome and a matching chromedriver
# (CHROME_BIN / CHROMEDRIVER when they are not on PATH).

PYTHON ?= python3
WORKERS ?= auto
REPORTS ?= artifacts
RUN = E2E_PYTHON=$(PYTHON) scripts/e2e-run.sh

.PHONY: e2e e2e-docker e2e-stack e2e-run e2e-stop e2e-suites e2e-deps

e2e-deps:
	$(PYTHON) -m pip install -q -r tests/requirements.txt

e2e-stack:
	scripts/e2e-stack.sh

e2e-stop:
	scripts/e2e-stack.sh stop

e2e-run:
	$(RUN) $(ARGS)

# Desktop, mobile and security, each with an HTML report; reruns are off (pytest.ini).
e2e-suites:
	mkdir -p $(REPORTS)
	$(RUN) tests/e2e -n $(WORKERS) --viewport desktop --html=$(REPORTS)/e2e-desktop.html --self-contained-html
	$(RUN) tests/e2e -n $(WORKERS) --viewport mobile --html=$(REPORTS)/e2e-mobile.html --self-contained-html
	$(RUN) tests/security -n $(WORKERS) --html=$(REPORTS)/security.html --self-contained-html

e2e:
	scripts/e2e-stack.sh
	$(MAKE) e2e-suites; status=$$?; scripts/e2e-stack.sh stop; exit $$status

COMPOSE = docker compose -f docker-compose.test.yml
DOCKER_ENV = E2E_DATABASE_URL=postgresql://zproo:zproo@localhost:55432/zproo_e2e \
	E2E_PROD_REDIS_URL=redis://localhost:56379/6

e2e-docker:
	$(COMPOSE) up -d --wait
	curl -sf -X POST http://localhost:5100/api/test/reset >/dev/null
	$(DOCKER_ENV) $(MAKE) e2e-suites; status=$$?; $(COMPOSE) down -v; exit $$status
