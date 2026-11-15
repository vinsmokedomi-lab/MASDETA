import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.masdeta.app',
  appName: 'MASDETA',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
};

export default config;
