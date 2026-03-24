import type { ReactNode } from 'react';

import type { DatabaseHandle } from '@/src/db/database';

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useDatabaseContext(): DatabaseHandle {
  return null;
}
