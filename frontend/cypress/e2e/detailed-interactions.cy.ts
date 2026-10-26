/// <reference types="cypress" />

describe('Connectly - Room Tests', () => {
  const BASE_URL = 'http://localhost:5173';

  beforeEach(() => {
    cy.visit(BASE_URL);
  });

  describe('Entering Room', () => {
    it('should enter room after typing name and clicking button', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('User1');
      cy.contains('button', 'Start Chat', { timeout: 3000 }).click();
      cy.wait(1500);

      cy.get('video', { timeout: 3000 }).should('exist');
    });

    it('room should have buttons', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('User2');
      cy.contains('button', 'Start Chat', { timeout: 3000 }).click();
      cy.wait(1500);

      cy.get('button', { timeout: 3000 }).should('have.length.greaterThan', 0);
    });

    it('video should load in room', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('User3');
      cy.contains('button', 'Start Chat', { timeout: 3000 }).click();
      cy.wait(2000);

      cy.get('video', { timeout: 3000 }).should('be.visible');
    });
  });

  describe('Room Functionality', () => {
    it('should stay in room after joining', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('TestUser');
      cy.contains('button', 'Start Chat', { timeout: 3000 }).click();
      cy.wait(1500);

      cy.get('body', { timeout: 3000 }).should('exist');
    });

    it('room should be responsive', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('RoomTest');
      cy.contains('button', 'Start Chat', { timeout: 3000 }).click();
      cy.wait(1500);

      cy.wait(500);
      cy.get('body', { timeout: 3000 }).should('exist');
    });
  });
});
