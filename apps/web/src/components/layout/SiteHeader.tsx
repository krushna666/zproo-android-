import { Button, cn } from '@zproo/ui';
import { BadgePercent, CircleHelp, Menu, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { Logo } from '@/components/brand/Logo';
import { SERVICES } from '@/config/services';
import { useHotkey } from '@/hooks/useHotkey';
import { CurrencySelect } from './CurrencySelect';
import { MobileMenu } from './MobileMenu';
import { QuickSearchDialog } from './QuickSearchDialog';
import { UserMenu } from './UserMenu';

const utilityLink =
  'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-foreground/80 transition-colors hover:bg-background hover:text-foreground';

export function SiteHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useHotkey(
    (e) => (e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/',
    () => setSearchOpen(true),
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-(--header-height) max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label="ZPROO GO home" className="shrink-0 rounded-lg">
          <Logo height={32} priority />
        </Link>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden h-9 items-center gap-2 rounded-full border border-border bg-background pl-3 pr-2 text-sm text-muted transition-colors hover:border-foreground/30 md:inline-flex"
          >
            <Search aria-hidden className="size-4" />
            <span className="w-40 text-left lg:w-52">Search flights, buses…</span>
            <kbd className="rounded-md border border-border bg-card px-1.5 text-[11px] font-semibold">
              Ctrl K
            </kbd>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
          >
            <Search aria-hidden className="size-5!" />
          </Button>
          <NavLink to="/offers" className={cn(utilityLink, 'hidden lg:inline-flex')}>
            <BadgePercent aria-hidden className="size-4 text-primary" /> Offers
          </NavLink>
          <NavLink to="/help" className={cn(utilityLink, 'hidden lg:inline-flex')}>
            <CircleHelp aria-hidden className="size-4 text-primary" /> Help
          </NavLink>
          <CurrencySelect className="hidden md:block" />
          <div className="hidden md:block">
            <UserMenu />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu aria-hidden className="size-5!" />
          </Button>
        </div>
      </div>

      <nav aria-label="Travel services" className="hidden border-t border-border/70 md:block">
        <ul className="mx-auto flex max-w-7xl items-stretch gap-1 overflow-x-auto px-4 sm:px-6 lg:justify-between lg:px-8 [scrollbar-width:none]">
          <li>
            <ServiceNavLink to="/" label="Home" end />
          </li>
          {SERVICES.map(({ label, path, icon }) => (
            <li key={path}>
              <ServiceNavLink to={path} label={label} icon={icon} />
            </li>
          ))}
        </ul>
      </nav>

      <QuickSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} />
    </header>
  );
}

interface ServiceNavLinkProps {
  to: string;
  label: string;
  icon?: (typeof SERVICES)[number]['icon'];
  end?: boolean;
}

function ServiceNavLink({ to, label, icon: Icon, end }: ServiceNavLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'relative flex h-11 items-center gap-1.5 whitespace-nowrap px-2.5 text-sm font-semibold transition-colors',
          'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
          isActive
            ? 'text-primary after:bg-primary'
            : 'text-foreground/75 after:bg-transparent hover:text-foreground',
        )
      }
    >
      {Icon && <Icon aria-hidden className="size-4" />}
      {label}
    </NavLink>
  );
}
