export type ThemePresetId =
  | 'darkNavy'
  | 'amoledBlack'
  | 'cyberpunk'
  | 'sakura'
  | 'dracula';

export type PremiumTheme = {
  id: ThemePresetId;
  label: string;
  gradient: readonly [string, string, string];
  orbGradients: readonly [
    readonly [string, string],
    readonly [string, string],
    readonly [string, string]
  ];
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  cardBackground: string;
  cardBorder: string;
  surfaceStrong: string;
  surfaceMuted: string;
  tabBarBackground: string;
  tabBarBorder: string;
  inputBackground: string;
  separator: string;
  accentPrimary: string;
  accentSecondary: string;
  accentTertiary: string;
  success: string;
  warning: string;
  danger: string;
};

const BASE_THEME = {
  textPrimary: '#F8FAFC',
  textSecondary: 'rgba(226, 232, 240, 0.76)',
  textMuted: 'rgba(226, 232, 240, 0.56)',
  separator: 'rgba(255,255,255,0.08)',
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#FDA4AF',
} as const;

const THEMES: Record<ThemePresetId, PremiumTheme> = {
  darkNavy: {
    id: 'darkNavy',
    label: 'Dark Navy',
    gradient: ['#06101F', '#102744', '#040812'],
    orbGradients: [
      ['rgba(59, 130, 246, 0.62)', 'rgba(59, 130, 246, 0.06)'],
      ['rgba(14, 165, 233, 0.48)', 'rgba(14, 165, 233, 0.05)'],
      ['rgba(99, 102, 241, 0.38)', 'rgba(99, 102, 241, 0.04)'],
    ],
    cardBackground: 'rgba(10, 18, 36, 0.46)',
    cardBorder: 'rgba(255,255,255,0.12)',
    surfaceStrong: 'rgba(255,255,255,0.14)',
    surfaceMuted: 'rgba(255,255,255,0.08)',
    tabBarBackground: 'rgba(7, 14, 29, 0.62)',
    tabBarBorder: 'rgba(255,255,255,0.11)',
    inputBackground: 'rgba(255,255,255,0.08)',
    accentPrimary: '#60A5FA',
    accentSecondary: '#38BDF8',
    accentTertiary: '#A78BFA',
    ...BASE_THEME,
  },
  amoledBlack: {
    id: 'amoledBlack',
    label: 'AMOLED Black',
    gradient: ['#000000', '#050505', '#000000'],
    orbGradients: [
      ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.01)'],
      ['rgba(148, 163, 184, 0.16)', 'rgba(148, 163, 184, 0.02)'],
      ['rgba(56, 189, 248, 0.18)', 'rgba(56, 189, 248, 0.02)'],
    ],
    cardBackground: 'rgba(8, 8, 8, 0.72)',
    cardBorder: 'rgba(255,255,255,0.1)',
    surfaceStrong: 'rgba(255,255,255,0.14)',
    surfaceMuted: 'rgba(255,255,255,0.07)',
    tabBarBackground: 'rgba(0, 0, 0, 0.8)',
    tabBarBorder: 'rgba(255,255,255,0.1)',
    inputBackground: 'rgba(255,255,255,0.08)',
    accentPrimary: '#F8FAFC',
    accentSecondary: '#38BDF8',
    accentTertiary: '#94A3B8',
    ...BASE_THEME,
  },
  cyberpunk: {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    gradient: ['#0D0D12', '#121212', '#0D0D12'],
    orbGradients: [
      ['rgba(250, 204, 21, 0.16)', 'rgba(250, 204, 21, 0.02)'],
      ['rgba(0, 255, 255, 0.15)', 'rgba(0, 255, 255, 0.02)'],
      ['rgba(168, 85, 247, 0.16)', 'rgba(168, 85, 247, 0.02)'],
    ],
    cardBackground: 'rgba(18, 18, 18, 0.52)',
    cardBorder: 'rgba(255,255,255,0.08)',
    surfaceStrong: 'rgba(255,255,255,0.1)',
    surfaceMuted: 'rgba(255,255,255,0.05)',
    tabBarBackground: 'rgba(13, 13, 18, 0.68)',
    tabBarBorder: 'rgba(255,255,255,0.1)',
    inputBackground: 'rgba(255,255,255,0.05)',
    accentPrimary: '#FCE205',
    accentSecondary: '#00FFFF',
    accentTertiary: '#A855F7',
    ...BASE_THEME,
    textPrimary: '#FFFFFF',
    textSecondary: '#A0A0A0',
  },
  sakura: {
    id: 'sakura',
    label: 'Sakura',
    gradient: ['#FFF0F5', '#FFE4E1', '#FFF0F5'],
    orbGradients: [
      ['rgba(244, 114, 182, 0.22)', 'rgba(244, 114, 182, 0.02)'],
      ['rgba(251, 191, 36, 0.18)', 'rgba(251, 191, 36, 0.01)'],
      ['rgba(190, 24, 93, 0.18)', 'rgba(190, 24, 93, 0.01)'],
    ],
    cardBackground: 'rgba(255, 255, 255, 0.65)',
    cardBorder: 'rgba(0,0,0,0.05)',
    surfaceStrong: 'rgba(0,0,0,0.08)',
    surfaceMuted: 'rgba(0,0,0,0.04)',
    tabBarBackground: 'rgba(255, 240, 245, 0.66)',
    tabBarBorder: 'rgba(0,0,0,0.05)',
    inputBackground: 'rgba(0,0,0,0.04)',
    accentPrimary: '#FF1493',
    accentSecondary: '#FB7185',
    accentTertiary: '#F9A8D4',
    ...BASE_THEME,
    textPrimary: '#1A1A1A',
    textSecondary: '#666666',
  },
  dracula: {
    id: 'dracula',
    label: 'Dracula',
    gradient: ['#12111C', '#241B34', '#0A0911'],
    orbGradients: [
      ['rgba(189, 147, 249, 0.62)', 'rgba(189, 147, 249, 0.05)'],
      ['rgba(139, 233, 253, 0.42)', 'rgba(139, 233, 253, 0.04)'],
      ['rgba(255, 121, 198, 0.34)', 'rgba(255, 121, 198, 0.03)'],
    ],
    cardBackground: 'rgba(24, 18, 35, 0.5)',
    cardBorder: 'rgba(255,255,255,0.12)',
    surfaceStrong: 'rgba(255,255,255,0.14)',
    surfaceMuted: 'rgba(255,255,255,0.08)',
    tabBarBackground: 'rgba(18, 13, 28, 0.66)',
    tabBarBorder: 'rgba(255,255,255,0.11)',
    inputBackground: 'rgba(255,255,255,0.08)',
    accentPrimary: '#BD93F9',
    accentSecondary: '#8BE9FD',
    accentTertiary: '#FF79C6',
    ...BASE_THEME,
  },
};

export const THEME_PRESET_OPTIONS = [
  { id: 'darkNavy', label: 'Dark Navy' },
  { id: 'amoledBlack', label: 'AMOLED Black' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'sakura', label: 'Sakura' },
  { id: 'dracula', label: 'Dracula' },
] as const satisfies readonly { id: ThemePresetId; label: string }[];

export const DEFAULT_THEME_PRESET: ThemePresetId = 'darkNavy';

export function getPremiumTheme(id: ThemePresetId): PremiumTheme {
  return THEMES[id] ?? THEMES[DEFAULT_THEME_PRESET];
}
