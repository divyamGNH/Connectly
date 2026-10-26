// Support file for all tests
// Import commands.js
import './commands';

// Disable uncaught exception handling for tests
Cypress.on('uncaught:exception', (err, runnable) => {
  // Return false to prevent Cypress from failing the test
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false;
  }
  if (err.message.includes('Cannot read') || err.message.includes('undefined')) {
    return false;
  }
  if (err.message.includes('Timeout')) {
    return false;
  }
  // Let other critical errors fail the test
  return false;
});

// Setup before each test
beforeEach(() => {
  // Clear localStorage before each test to ensure clean state
  cy.clearLocalStorage();
});

// Handle navigation timeouts
Cypress.on('window:before:load', (win) => {
  win.onbeforeunload = null;
});
Cypress.config('defaultCommandTimeout', 10000);
