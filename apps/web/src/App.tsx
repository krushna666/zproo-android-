import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider, type DataRouter } from 'react-router';
import { Toaster } from '@zproo/ui';
import { createQueryClient } from '@/lib/queryClient';

export function App({ router }: { router: DataRouter }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      {/* Before the router, as in entry-server.tsx: the prerendered router ends with its data
          <script>, so anything after it would not match on hydration. */}
      <Toaster />
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
