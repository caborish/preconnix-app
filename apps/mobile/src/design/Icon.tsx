// Outline icons from the design handoff (assets/icons), recoloured per use. Decorative unless a label is given.
import { SvgXml } from 'react-native-svg';
import { ICONS, type IconName } from './icons';

export function Icon({ name, size = 24, color, label }: { name: IconName; size?: number; color: string; label?: string }) {
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</g></svg>`;
  return (
    <SvgXml xml={xml} width={size} height={size} {...(label ? { accessible: true, accessibilityLabel: label } : {})} />
  );
}

export type { IconName };
