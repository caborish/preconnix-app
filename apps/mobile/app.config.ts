import type { ExpoConfig } from 'expo/config';

// Variants: development (default), preview (staging), production. See docs/architecture/03 §1.
const variant = (process.env.APP_VARIANT ?? 'development') as 'development' | 'preview' | 'production';
const suffix = variant === 'production' ? '' : `.${variant}`;

const config: ExpoConfig = {
  name: variant === 'production' ? 'PreConnix' : `PreConnix (${variant})`,
  slug: 'preconnix',
  version: '1.0.0',
  scheme: 'preconnix',
  orientation: 'portrait',
  // Launcher artwork: the approved Flourish mark on deep violet (see assets/brand/PROVENANCE.md).
  icon: './assets/brand/preconnix-app-icon-1024.png',
  userInterfaceStyle: 'light',
  backgroundColor: '#FFFAF9',
  ios: { bundleIdentifier: `com.preconnix.app${suffix}`, supportsTablet: true, infoPlist: { ITSAppUsesNonExemptEncryption: false } },
  android: { package: `com.preconnix.app${suffix}`, adaptiveIcon: { foregroundImage: './assets/brand/preconnix-adaptive-foreground-1024.png', backgroundColor: '#5C3A91' } },
  plugins: ['expo-router', 'expo-font', 'expo-web-browser'],
  experiments: { typedRoutes: true },
  extra: { variant, testBuild: variant !== 'production' }
};

export default config;
