import {
  BadgePercent,
  Bell,
  Bike,
  Building2,
  Bus,
  CalendarCheck,
  CarTaxiFront,
  ChartColumn,
  CircleUser,
  CreditCard,
  FileChartColumn,
  Handshake,
  Hotel,
  House,
  IdCard,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Plane,
  Settings,
  Ticket,
  TrainFront,
  TreePalm,
  Undo2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

/** Mobile bottom navigation (app-style). */
export const BOTTOM_NAV: readonly NavItem[] = [
  { label: 'Home', path: '/', icon: House },
  { label: 'Bookings', path: '/bookings', icon: CalendarCheck },
  { label: 'Wallet', path: '/wallet', icon: Wallet },
  { label: 'Offers', path: '/offers', icon: BadgePercent },
  { label: 'Profile', path: '/profile', icon: CircleUser },
];

export const FOOTER_LINKS = {
  company: [
    { label: 'About ZPROO GO', path: '/about' },
    { label: 'Offers', path: '/offers' },
    { label: 'ZPROO Wallet', path: '/wallet' },
    { label: 'Corporate Travel', path: '/corporate' },
  ],
  support: [
    { label: 'Help Center', path: '/help' },
    { label: 'Contact Us', path: '/contact' },
    { label: 'My Bookings', path: '/bookings' },
    { label: 'Track Parcel', path: '/parcel' },
  ],
  legal: [
    { label: 'Terms of Use', path: '/terms' },
    { label: 'Privacy Policy', path: '/privacy' },
    { label: 'Refund Policy', path: '/refund-policy' },
  ],
} as const;

export interface AdminNavItem extends NavItem {
  /** URL segment under /admin; empty for the dashboard. */
  segment: string;
  phase: number;
}

const admin = (label: string, segment: string, icon: LucideIcon, phase = 18): AdminNavItem => ({
  label,
  segment,
  icon,
  phase,
  path: segment ? `/admin/${segment}` : '/admin',
});

/** Admin sidebar. Section pages arrive in Phases 18–19; Users is live from Phase 2. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  admin('Dashboard', '', LayoutDashboard),
  admin('Users', 'users', Users, 2),
  admin('Bookings', 'bookings', CalendarCheck),
  admin('Flights', 'flights', Plane),
  admin('Buses', 'buses', Bus),
  admin('Trains', 'trains', TrainFront),
  admin('Hotels', 'hotels', Hotel),
  admin('Cabs', 'cabs', CarTaxiFront),
  admin('Bikes', 'bikes', Bike),
  admin('Holidays', 'holidays', TreePalm),
  admin('Parcels', 'parcels', Package),
  admin('Corporate', 'corporate', Building2),
  admin('Drivers', 'drivers', IdCard),
  admin('Partners', 'partners', Handshake),
  admin('Payments', 'payments', CreditCard),
  admin('Refunds', 'refunds', Undo2),
  admin('Wallet', 'wallet', Wallet),
  admin('Offers', 'offers', BadgePercent),
  admin('Coupons', 'coupons', Ticket),
  admin('Notifications', 'notifications', Bell),
  admin('Support', 'support', LifeBuoy),
  admin('Reports', 'reports', FileChartColumn, 19),
  admin('Analytics', 'analytics', ChartColumn, 19),
  admin('Settings', 'settings', Settings),
];
