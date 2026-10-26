/// <reference types="cypress" />

describe('Connectly - White Box Tests', () => {
  const BASE_URL = 'http://localhost:5173';

  beforeEach(() => {
    cy.visit(BASE_URL);
  });

  it('white-box placeholder: landing internals initialized', () => {
    cy.get('body').should('exist');
    cy.get('input[type="text"]').should('exist');
    cy.contains('button', 'Start Chat').should('exist');
  });

  it('white-box placeholder: join flow branch reachable', () => {
    cy.get('input[type="text"]').type('WBUser');
    cy.contains('button', 'Start Chat').click();
    cy.get('body').should('exist');
  });

  it('white-box placeholder: room controls rendered', () => {
    cy.get('input[type="text"]').type('WBUser2');
    cy.contains('button', 'Start Chat').click();
    cy.contains('button', 'NEXT').should('exist');
  });
});
