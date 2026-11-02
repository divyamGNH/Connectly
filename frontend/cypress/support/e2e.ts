import './commands';
// Uncaught application exceptions fail tests; never suppress every exception.
beforeEach(() => {
  cy.request('POST', `${Cypress.expose('backendUrl')}/__test/reset`, {});
});
