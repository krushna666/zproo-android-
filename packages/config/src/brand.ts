/**
 * Single source of truth for ZPROO GO brand values shared by the web app,
 * API (emails, PDFs) and documentation. The logo itself is a file asset —
 * never re-draw it; reference it via these paths.
 */
export const BRAND = {
  name: 'ZPROO GO',
  tagline: 'Travel Smarter. Go Further.',
  description: 'Unified Mobility & Travel Super App',
  assets: {
    /** Official full-colour logo (transparent background). */
    logo: '/assets/brand/zproo-go-logo.png',
    /** Intrinsic pixel size of `logo`, used to reserve layout space and keep the aspect ratio. */
    logoSize: { width: 302, height: 77 },
    favicon: '/assets/brand/favicon.png',
  },
  /** The 13 design tokens (UI Style SOP §2.1); same values as apps/web/src/styles/globals.css. */
  colors: {
    primary: '#D9141E',
    primaryHover: '#B80F18',
    primaryLight: '#FDECEC',
    primaryForeground: '#FFFFFF',
    background: '#F8FAFC',
    foreground: '#111827',
    muted: '#6B7280',
    border: '#E5E7EB',
    card: '#FFFFFF',
    ring: '#D9141E',
    success: '#16A34A',
    warning: '#F59E0B',
    danger: '#DC2626',
  },
  /** Printed on tickets and vouchers. Placeholder address: confirm before launch. */
  support: {
    email: 'support@zproogo.com',
    hours: '24×7',
  },
} as const;
