import type {
  BookingDetails,
  ErrorCode,
  ErrorDetails,
  FieldIssue,
  Permission,
  PublicUser,
  RoleName,
} from '@zproo/types';
import { ROLE_PERMISSIONS } from '@zproo/types';
import { formatMoney } from '@zproo/utils';
import type { z } from 'zod';

/**
 * Static mode: the website answers its own API calls in the browser, from built-in demo data and
 * this browser's storage. No server, database or network is involved.
 */

export class StaticError extends Error {
  readonly details: ErrorDetails | undefined;
  /** `details` may be validation issues (mapped to `fields` + `issues`, as the API does). */
  constructor(
    readonly status: number,
    readonly errorCode: ErrorCode,
    message: string,
    details?: FieldIssue[] | ErrorDetails,
  ) {
    super(message);
    this.details = Array.isArray(details) ? validationDetails(details) : details;
  }
}

function validationDetails(issues: FieldIssue[]): ErrorDetails {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.replace(/^(body|query|params|headers)\.?/, '') || '_';
    fields[key] ??= issue.message;
  }
  return { fields, issues };
}

export const invalid = (issues: FieldIssue[]) =>
  new StaticError(400, 'VALIDATION_ERROR', 'Please fix the errors', issues);

export const priceChanged = (oldTotal: number, newTotal: number) =>
  new StaticError(
    409,
    'PRICE_CHANGED',
    `The fare changed from ${formatMoney(oldTotal)} to ${formatMoney(newTotal)}.`,
    { oldTotal, newTotal },
  );

export const seatUnavailable = (seats: string[]) =>
  new StaticError(
    409,
    'SEAT_UNAVAILABLE',
    `Seat ${seats.length <= 1 ? (seats[0] ?? '') : `${seats.slice(0, -1).join(', ')} and ${seats.at(-1) ?? ''}`} was just booked by someone else. Please choose another seat.`,
    { seats },
  );

export const fareUnavailable = () =>
  new StaticError(
    409,
    'FARE_UNAVAILABLE',
    'This fare is no longer available. Please choose another flight or fare.',
  );

export const holdExpired = (message = 'Your hold has expired. Please start again.') =>
  new StaticError(410, 'HOLD_EXPIRED', message);

export const notFound = (message = 'Not found') => new StaticError(404, 'NOT_FOUND', message);
export const unauthenticated = () =>
  new StaticError(401, 'UNAUTHENTICATED', 'Please sign in to continue');

export interface StaticRequest {
  method: string;
  /** Path under /api, e.g. "/flights/search" */
  path: string;
  params: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

export interface StaticResult {
  status?: number;
  message?: string;
  data: unknown;
}

/** Parses input with a shared schema, turning failures into the API's validation error. */
export function parse<S extends z.ZodType>(schema: S, input: unknown, prefix: string): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw invalid(
      result.error.issues.map((i) => ({
        path: [prefix, ...i.path.map(String)].join('.'),
        message: i.message,
      })),
    );
  }
  return result.data;
}

// ───────── storage ─────────

export interface StoredUser {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  /** SHA-256 of the password (demo storage in this browser only) */
  passwordHash: string | null;
  createdAt: string;
}

export interface StoredBooking {
  userId: string;
  idempotencyKey: string;
  details: BookingDetails;
  /** Inventory held by the booking (flight seats per offer, or bus seats) */
  holds:
    | { kind: 'flight'; offerId: string; seats: number }[]
    | { kind: 'bus'; tripId: string; seats: string[] }[];
}

export interface StoredPayment {
  id: string;
  reference: string;
  userId: string;
  orderId: string;
  amountPaise: number;
  status: 'CREATED' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
}

export interface Db {
  users: StoredUser[];
  sessionUserId: string | null;
  otps: Record<string, { code: string; expiresAt: number }>;
  signupTokens: Record<string, string>;
  bookings: StoredBooking[];
  payments: StoredPayment[];
}

const KEY = 'zproo-go-static-db';
const empty = (): Db => ({
  users: [],
  sessionUserId: null,
  otps: {},
  signupTokens: {},
  bookings: [],
  payments: [],
});

let memory: Db | null = null;

/** The demo database, kept in this browser's localStorage (in memory if storage is blocked). */
export function db(): Db {
  if (memory) return memory;
  try {
    const raw = window.localStorage.getItem(KEY);
    memory = raw ? { ...empty(), ...(JSON.parse(raw) as Partial<Db>) } : empty();
  } catch {
    memory = empty();
  }
  return memory;
}

export function save(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(db()));
  } catch {
    /* storage blocked: data lasts until the tab closes */
  }
}

/** Test helper: forget everything. */
export function resetStaticDb(): void {
  memory = empty();
  save();
}

// ───────── helpers ─────────

export const randomId = () =>
  crypto.randomUUID
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now()}${Math.random()}`.replace('.', '');

export function randomDigits(n: number): string {
  const values = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(values, (v) => String(v % 10)).join('');
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const USER_ROLES: RoleName[] = ['USER'];

export function publicUser(u: StoredUser): PublicUser {
  return {
    id: u.id,
    fullName: u.fullName,
    phone: u.phone,
    email: u.email,
    avatarUrl: null,
    phoneVerified: Boolean(u.phone),
    emailVerified: false,
    hasPassword: Boolean(u.passwordHash),
    roles: USER_ROLES,
    permissions: ROLE_PERMISSIONS.USER as Permission[],
    createdAt: u.createdAt,
  };
}

/** The signed-in user, or 401. */
export function currentUser(): StoredUser {
  const d = db();
  const user = d.users.find((u) => u.id === d.sessionUserId);
  if (!user) throw unauthenticated();
  return user;
}
