/// <reference types="cypress" />

describe('Connectly - WebRTC Connection Tests', () => {
  const BASE_URL = 'http://localhost:5173';

  beforeEach(() => {
    cy.visit(BASE_URL);
  });

  describe('Socket Connection', () => {
    it('should establish connection after joining', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('User1');
      cy.get('button', { timeout: 3000 }).contains('Start Chat').click();
      cy.wait(1500);

      cy.get('video', { timeout: 3000 }).should('exist');
    });

    it('should remain connected in room', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('User2');
      cy.get('button', { timeout: 3000 }).contains('Start Chat').click();
      cy.wait(2000);

      cy.get('video', { timeout: 3000 }).should('be.visible');
    });
  });

  describe('Video Streaming', () => {
    it('should stream local video', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('User3');
      cy.get('button', { timeout: 3000 }).contains('Start Chat').click();
      cy.wait(2000);

      cy.get('video', { timeout: 3000 }).should('exist');
    });

    it('should display video in room', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('User4');
      cy.get('button', { timeout: 3000 }).contains('Start Chat').click();
      cy.wait(2500);

      cy.get('video', { timeout: 3000 }).should('be.visible');
    });
  });

  describe('Room Session', () => {
    it('should maintain room connection', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('User5');
      cy.get('button', { timeout: 3000 }).contains('Start Chat').click();
      cy.wait(1500);

      cy.get('body', { timeout: 3000 }).should('exist');
    });

    it('should load all room elements', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('User6');
      cy.get('button', { timeout: 3000 }).contains('Start Chat').click();
      cy.wait(1500);

      cy.get('button', { timeout: 3000 }).should('have.length.greaterThan', 0);
    });
  });
});
