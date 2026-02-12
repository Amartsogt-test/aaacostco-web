import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aaacostco.app',
  appName: 'AAA Costco',
  webDir: 'dist',
  server: {
    // Allow mixed content for Firebase connections
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#005DA3', // Costco blue
      showSpinner: true,
      spinnerColor: '#FFFFFF'
    },
    StatusBar: {
      backgroundColor: '#005DA3',
      style: 'LIGHT' // white text on blue
    }
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
