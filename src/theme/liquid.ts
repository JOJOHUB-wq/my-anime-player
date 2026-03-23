export const LIQUID_GRADIENT = ['#0b1020', '#1b1740', '#101827'] as const;
export const SOFT_LIQUID_GRADIENT = ['#162032', '#28365b', '#1a2435'] as const;

export const LIQUID_COLORS = {
  textPrimary: '#F8FAFC',
  textSecondary: 'rgba(226, 232, 240, 0.76)',
  textMuted: 'rgba(226, 232, 240, 0.56)',
  border: 'rgba(255,255,255,0.14)',
  softBorder: 'rgba(255,255,255,0.1)',
  chip: 'rgba(255,255,255,0.08)',
  button: 'rgba(255,255,255,0.14)',
  danger: '#FCA5A5',
  accentBlue: '#67E8F9',
  accentPurple: '#C4B5FD',
  accentGold: '#FBBF24',
} as const;

export function getLiquidGradient(isDarkModeEnabled: boolean) {
  return isDarkModeEnabled ? LIQUID_GRADIENT : SOFT_LIQUID_GRADIENT;
}

export function getGlassCardAppearance(isDarkModeEnabled: boolean) {
  return isDarkModeEnabled
    ? {
        borderColor: LIQUID_COLORS.border,
        backgroundColor: 'rgba(255,255,255,0.07)',
      }
    : {
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(255,255,255,0.11)',
      };
}
