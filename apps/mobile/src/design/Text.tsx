// The app's Text: React Native's, with plain-text children tidied so lines break well (see typeset.ts).
import { Text as NativeText, type TextProps } from 'react-native';
import { tidyNode } from './typeset';

export function Text({ children, ...props }: TextProps) {
  return <NativeText {...props}>{tidyNode(children)}</NativeText>;
}
