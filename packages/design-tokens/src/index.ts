// Design tokens from the legacy RRA CSS (docs/architecture/03 §7), aligned with the Guided companion design
// handoff (29 Oct 2026): softer borders, deep-violet primary actions, Outfit Bold headings.
export const colors = {
  rose: '#E84C6F',
  roseDark: '#C73A5A',
  roseWash: '#FDF2F5',
  violet: '#7B4FBF',
  violetDark: '#5C3A91',
  violetWash: '#F3EEF9',
  textPrimary: '#2D2438',
  textSecondary: '#6B5E7B',
  textMuted: '#6E6280',
  cream: '#FFFAF9',
  white: '#FFFFFF',
  border: '#E8E0ED',
  good: '#2EAD82',
  green: '#24735B',
  greenWash: '#EDF7F2',
  alert: '#C62828',
  plum: '#2D2438'
} as const;

export const fonts = {
  heading: 'Outfit_700Bold',
  headingBlack: 'Outfit_900Black',
  label: 'Outfit_600SemiBold',
  body: 'LibreFranklin_400Regular',
  bodyMedium: 'LibreFranklin_500Medium'
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 14, button: 13, md: 20, pill: 999 } as const;
