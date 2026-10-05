import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@zproo/ui';
import { useParams } from 'react-router';
import { Seo } from '@/components/seo/Seo';
import { ADMIN_NAV } from '@/config/navigation';
import { NotFoundPage } from '@/pages/NotFoundPage';

/** Placeholder for admin sections that are not built yet. */
export default function AdminSectionPage() {
  const { section = '' } = useParams();
  const item = ADMIN_NAV.find((entry) => entry.segment === section);
  if (!item) return <NotFoundPage />;
  const Icon = item.icon;

  return (
    <div className="space-y-6">
      <Seo title={`${item.label} · Admin`} noIndex />
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-primary-light text-primary">
          <Icon aria-hidden className="size-5" />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">{item.label}</h1>
      </div>
      <Card>
        <CardHeader>
          <Badge variant="soft" className="self-start">
            Coming soon
          </Badge>
          <CardTitle>{item.label} management is being built</CardTitle>
          <CardDescription>
            Search, filters, sorting, pagination and CSV export will appear here, backed by
            permission-checked admin APIs.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
