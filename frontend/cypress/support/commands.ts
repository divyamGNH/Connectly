Cypress.Commands.add('loginToApp', (userName: string) => {
  cy.visit('/');
  cy.contains('Camera and microphone ready.').should('be.visible');
  cy.get('input[type="text"]').type(userName);
  cy.contains('button', 'Start Chat').should('be.enabled').click();
  cy.get('[data-testid="connection-status"]').should('contain', 'Waiting for a partner');
});
Cypress.Commands.add('sendMessage', (message: string) => {
  cy.get('input[aria-label="Message"]').type(message);
  cy.contains('button', 'Send').click();
});
declare global {
  // Cypress requires namespace augmentation for custom commands.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      loginToApp(userName: string): Chainable<void>;
      sendMessage(message: string): Chainable<void>;
    }
  }
}
export {};
