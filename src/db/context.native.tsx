import type { ReactNode } from 'react';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';

import { initializeDatabase, type DatabaseHandle } from '@/src/db/database';

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName="media-manager.db" onInit={initializeDatabase}>
      {children}
    </SQLiteProvider>
  );
}

export function useDatabaseContext(): DatabaseHandle {
  return useSQLiteContext();
}
