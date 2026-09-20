// Design tokens ported from the static prototype (../index.html :root variables).
export const colors = {
  bg: '#f7f5f2',
  surface: '#ffffff',
  ink: '#2a2a32',
  muted: '#7a7785',
  lavender: '#b9a8e8',
  lavenderSoft: '#efeafc',
  lavenderDeep: '#6d54b8',
  peach: '#f8e0d0',
  mint: '#d8efe6',
  line: '#ddd6f0',
  scrapPeachText: '#5d5868',
  scrapThumb: 'rgba(255,255,255,0.7)',
  pillBg: 'rgba(255,255,255,0.65)',
  pillText: '#5a5568',
  captureText: '#6d5ea0',
  captureIcon: '#8b74d8',
} as const;

export const radii = {
  sm: 12,
  md: 16,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const type = {
  wordmark: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.4 },
  invite: { fontSize: 16, fontWeight: '400' as const },
  sectionLabel: { fontSize: 15, fontWeight: '700' as const, letterSpacing: -0.1 },
  scrapTitle: { fontSize: 16, fontWeight: '700' as const, letterSpacing: -0.1 },
  scrapSubtitle: { fontSize: 14, fontWeight: '400' as const },
  pill: { fontSize: 12, fontWeight: '600' as const },
  tab: { fontSize: 12, fontWeight: '600' as const },
};

export const shadow = {
  shadowColor: '#5a468c',
  shadowOpacity: 0.08,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 10 },
  elevation: 4,
};
