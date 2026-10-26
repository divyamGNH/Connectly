/// <reference types="cypress" />

/**
 * Custom Commands for Connectly Tests
 */

// Login to app (navigate and enter name)
Cypress.Commands.add('loginToApp', (userName: string) => {
  cy.visit('http://localhost:5173');
  cy.get('input[type="text"]').type(userName);
  cy.get('button').contains('Start Chat').click();
});

// Wait for video to be visible
Cypress.Commands.add('waitForVideo', () => {
  cy.get('video', { timeout: 10000 }).should('be.visible');
});

// Find and click a button by text
Cypress.Commands.add('clickButton', (text: string) => {
  cy.get('button').contains(text).click();
});

// Find and interact with camera control
Cypress.Commands.add('toggleCamera', () => {
  cy.get('button').then(($buttons) => {
    const cameraBtn = Array.from($buttons).find((btn) =>
      btn.textContent?.includes('Camera')
    );
    if (cameraBtn) {
      cy.wrap(cameraBtn).click();
    }
  });
});

// Find and interact with microphone control
Cypress.Commands.add('toggleMicrophone', () => {
  cy.get('button').then(($buttons) => {
    const micBtn = Array.from($buttons).find((btn) =>
      btn.textContent?.includes('Mic')
    );
    if (micBtn) {
      cy.wrap(micBtn).click();
    }
  });
});

// Send a message
Cypress.Commands.add('sendMessage', (message: string) => {
  cy.get('body').then(($body) => {
    const input =
      $body.find('input[type="text"]').last() ||
      $body.find('textarea').last();

    if (input.length > 0) {
      cy.wrap(input).type(message);

      // Look for Send button
      const sendBtn = Array.from($body.find('button')).find((btn) =>
        btn.textContent?.includes('Send')
      );

      if (sendBtn) {
        cy.wrap(sendBtn).click();
      }
    }
  });
});

// Check if element is visible
Cypress.Commands.add('isVisible', (selector: string) => {
  cy.get(selector).should('be.visible');
});

// Check if element exists
Cypress.Commands.add('elementExists', (selector: string) => {
  cy.get(selector).should('exist');
});

// Helper to get button by text
Cypress.Commands.add('getButtonByText', (text: string) => {
  return cy.get('button').contains(text);
});

// Wait for element to disappear
Cypress.Commands.add('waitForElementToDisappear', (selector: string) => {
  cy.get(selector).should('not.exist', { timeout: 5000 });
});

// Type with delay (more natural)
Cypress.Commands.add('typeSlowly', (text: string, duration: number = 50) => {
  cy.focused().type(text, { delay: duration });
});

// Declare custom commands for TypeScript
declare global {
  namespace Cypress {
    interface Chainable {
      loginToApp(userName: string): Chainable<void>;
      waitForVideo(): Chainable<void>;
      clickButton(text: string): Chainable<void>;
      toggleCamera(): Chainable<void>;
      toggleMicrophone(): Chainable<void>;
      sendMessage(message: string): Chainable<void>;
      isVisible(selector: string): Chainable<void>;
      elementExists(selector: string): Chainable<void>;
      getButtonByText(text: string): Chainable<JQuery<HTMLElement>>;
      waitForElementToDisappear(selector: string): Chainable<void>;
      typeSlowly(text: string, duration?: number): Chainable<void>;
    }
  }
}
