import { type ReactNode } from 'react';

import { LiquidBackground } from '@/src/components/ui/liquid-background';

export function BackgroundShell({ children }: { children: ReactNode }) {
  return <LiquidBackground>{children}</LiquidBackground>;
}
