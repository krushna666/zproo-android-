import { env } from '@/lib/env';

/** How the on-screen code hint is labelled (codes are shown only when no SMS is really sent). */
export const devCodeLabel = env.staticMode ? 'Demo mode' : 'Development mode';
