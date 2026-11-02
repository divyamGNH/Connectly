import { defineConfig } from 'cypress';
export default defineConfig({
  video: false,
  allowCypressEnv: false,
  screenshotOnRunFailure: true,
  e2e: {
    baseUrl: 'http://127.0.0.1:5173',
    viewportWidth: 1280,
    viewportHeight: 800,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    testIsolation: true,
    retries: 0,
    specPattern: 'cypress/e2e/**/*.cy.ts',
    setupNodeEvents(on) {
      on('before:browser:launch', (browser, options) => {
        if (browser.family === 'chromium' && browser.name !== 'electron') {
          options.args.push('--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required');
        }
        return options;
      });
    },
  },
});
