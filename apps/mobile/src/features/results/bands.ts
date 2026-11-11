// Traffic-light colours for the result bands (the website's green / yellow / red bands), used on Home and the
// results screen. The band name is always written out too, so colour is never the only signal.
import { colors } from '@/design/tokens';

export const BAND_STYLE = {
  high: { bg: 'rgba(46,173,130,0.12)', fg: '#11704F', dot: colors.good },
  moderate: { bg: '#FFF4DD', fg: '#8A5300', dot: '#F2A516' },
  low: { bg: 'rgba(198,40,40,0.08)', fg: '#A11F1F', dot: '#DC2626' }
} as const;
