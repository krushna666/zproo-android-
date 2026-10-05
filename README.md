<p align="center">
  <img src="apps/web/public/assets/brand/zproo-go-logo.png" alt="ZPROO GO" height="56" />
</p>

<h3 align="center">Unified Mobility & Travel Super App</h3>
<p align="center"><em>Travel Smarter. Go Further.</em></p>

---

ZPROO GO brings flights, buses, trains, hotels, cabs, bike taxis, holidays, parcel delivery and
corporate travel into one platform: a customer website, an admin panel, a REST + real-time API,
and a PostgreSQL database.

## What's included

This release is a working **flights and buses** booking platform, built Maharashtra-first
(Pune and Mumbai at the top of every list):

| Area        | What works                                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts    | Sign up and sign in with mobile OTP, password, or Google; sessions with rotating refresh tokens; profile; role-based admin access                                                         |
| Flights     | One way, round trip and multi-city search; filters and sorting; fare details; traveller details; review; payment; PNR and PDF e-ticket                                                    |
| Buses       | City-to-city search; filters and sorting; live seat map (sleeper/seater, both decks, ladies-only seats); boarding and dropping points; travellers; payment; operator PNR and PDF e-ticket |
| My bookings | Upcoming, past and cancelled flight and bus bookings, each linking to its ticket or payment                                                                                               |
| Payments    | Server-side priced orders, signature verification, idempotent booking, seat holds that expire                                                                                             |
| Admin       | Admin panel with user management (other sections show "Coming soon")                                                                                                                      |
| Platform    | REST API with OpenAPI docs, PostgreSQL (Prisma), Redis caching and rate limits, PDF tickets, 330+ automated tests, CI                                                                     |

Other services in the navigation (trains, hotels, cabs, bikes, holidays, parcel, corporate, wallet,
offers) show a **Coming soon** page. The plan for them is in
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

> **Demo inventory.** Development uses built-in mock providers: fictional airlines and bus
> operators and a simulated payment gateway (no money moves; tickets are watermarked "not valid
> for travel"). Production refuses to start with these mocks — connect real flight, bus and
> payment (e.g. Razorpay) providers and an SMS provider before going live. See
> [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Tech stack

| Layer   | Technology                                                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Web     | React 19, TypeScript, Vite, React Router, TanStack Query, Zustand, Axios, Tailwind CSS 4, shadcn/ui-style primitives, Lucide |
| API     | Node.js, Express 5, TypeScript, Zod, Pino, Helmet, OpenAPI (Swagger UI)                                                      |
| Data    | PostgreSQL + Prisma, Redis                                                                                                   |
| Tooling | npm workspaces, Turborepo, ESLint, Prettier, Vitest, Testing Library, Supertest, GitHub Actions                              |

## Repository layout

```
apps/
  web/        Customer website + admin panel (/admin), React + Vite
  api/        REST API (Express), health checks, OpenAPI docs
packages/
  config/     Shared tsconfig presets and brand constants
  types/      Shared enums, API envelope types, permission keys
  validation/ Shared Zod schemas (used by web forms and API validators)
  utils/      Money (paise) and booking-reference helpers
  ui/         Design-system primitives (Button, Card, Dialog, …)
prisma/       Schema, migrations, seed
docs/         Architecture, API, database, environment, security, testing
```

## Static website (no server needed)

The website runs **entirely in the browser** by default: flights, buses, sign-in, bookings,
payments (simulated) and tickets all work from built-in demo data, and each visitor's account and
bookings are kept in their own browser (localStorage). No API, database or Redis is needed.

```bash
npm install
npm run build -w @zproo/web      # → apps/web/dist  (upload this folder to any static host)
npm run preview -w @zproo/web    # or try it locally at http://localhost:4173
```

`apps/web/dist` includes routing rules for Netlify/Cloudflare Pages (`_redirects`), Vercel
(`vercel.json`), Apache (`.htaccess`), Windows/IIS (`web.config`) and GitHub Pages (`404.html`).
Publishing on GoDaddy: [docs/DEPLOY-GODADDY.md](docs/DEPLOY-GODADDY.md). For development with hot reload:
`npm run dev -w @zproo/web` (http://localhost:5173).

In the demo, sign in with any Indian mobile number — the one-time code is shown on screen. Tickets
open as a printable page (**Print → Save as PDF**). To use the real API instead, set
`VITE_DATA_SOURCE=api` and follow the full setup below.

## Getting started (full stack: website + API)

Prerequisites: **Node.js 22** (see `.nvmrc`), **npm 10+**, and either Docker or local PostgreSQL 16 + Redis 7.

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # one .env at the repo root; set VITE_DATA_SOURCE=api
npm run db:up               # Postgres + Redis via docker compose (skip if running locally)
npm run db:migrate          # apply migrations
npm run db:seed             # roles, settings, demo users, flight timetable, bus network
npm run dev                 # web → http://localhost:5173, API → http://localhost:5000
```

- API docs (Swagger UI): http://localhost:5000/api/docs
- Health: http://localhost:5000/api/health
- In development the web app proxies `/api` to the API, and the footer shows a live API/DB/Redis status dot.
- **Signing in locally:** use any mobile number. OTP codes are shown on screen and printed in the API
  terminal (development SMS provider). Seeded staff accounts, e.g. admin **9000000002**, support
  **9000000003**, are listed in [docs/DATABASE.md](docs/DATABASE.md#seed-data).
- **Try a booking:** search Pune → New Delhi on `/flights` or Pune → Mumbai on `/buses`, pick a fare
  or seats, sign in with any mobile number, and on the payment step choose **Pay** (or simulate a
  failed payment first). Download the PDF e-ticket from the confirmation page or **My bookings**.
- API tests use a separate `zproo_test` database, created automatically; Postgres and Redis must be running.

## Scripts

| Command              | What it does                                         |
| -------------------- | ---------------------------------------------------- |
| `npm run dev`        | Run web and API in watch mode                        |
| `npm run build`      | Production builds (`apps/web/dist`, `apps/api/dist`) |
| `npm run lint`       | ESLint (incl. accessibility and React hooks rules)   |
| `npm run typecheck`  | Strict TypeScript across all workspaces              |
| `npm run test`       | Unit and integration tests                           |
| `npm run format`     | Prettier                                             |
| `npm run db:migrate` | Create/apply migrations in development               |
| `npm run db:deploy`  | Apply migrations in CI/production                    |
| `npm run db:seed`    | Idempotent seed                                      |
| `npm run db:studio`  | Prisma Studio                                        |

## Documentation

- [Implementation plan](docs/IMPLEMENTATION_PLAN.md): architecture, phases, decisions
- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Database](docs/DATABASE.md)
- [Environment variables](docs/ENVIRONMENT.md)
- [Security](docs/SECURITY.md)
- [Testing](docs/TESTING.md)
- [Brand assets](docs/BRAND.md)
- [Contributing](CONTRIBUTING.md)

Deployment documentation arrives with the Docker and deployment phases (21–23).
