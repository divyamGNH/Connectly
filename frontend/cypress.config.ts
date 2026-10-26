// Cypress configuration
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    viewportWidth: 1280,
    viewportHeight: 720,
    
    // Timeouts - shorter to prevent freezing
    defaultCommandTimeout: 5000,
    requestTimeout: 5000,
    responseTimeout: 5000,
    taskTimeout: 5000,
    navigationTimeout: 5000,
    
    // Retries - reduced to allow faster progression
    retries: {
      runMode: 1,
      openMode: 0,
    },

    // Video settings
    video: true,
    videoCompression: 32,
    screenshotOnRunFailure: true,

    // Enable experimental features
    experimentalMemoryManagement: true,
    
    // Server settings
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    
    // Test isolation
    testIsolation: false,
    
    // Request handling
    failOnStatusCode: false,

    setupNodeEvents(on, config) {
      // Listen for test events
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },
      });
    },
  },

  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite',
    },
  },
});
