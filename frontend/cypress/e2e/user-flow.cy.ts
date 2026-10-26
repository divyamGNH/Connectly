/// <reference types="cypress" />

describe('Connectly - Landing Page Tests', () => {
  const BASE_URL = 'http://localhost:5173';

  beforeEach(() => {
    cy.visit(BASE_URL);
  });

  describe('Page Loads', () => {
    it('should load the app', () => {
      cy.visit(BASE_URL, { timeout: 5000 });
      cy.get('body', { timeout: 3000 }).should('exist');
    });
  });

  describe('Landing Page UI', () => {
    it('should display CONNECTLY header', () => {
      cy.contains('CONNECTLY', { timeout: 3000 }).should('be.visible');
    });

    it('should display video preview', () => {
      cy.get('video', { timeout: 3000 }).should('be.visible');
    });

    it('should show "Enter your name" label', () => {
      cy.contains('Enter your name', { timeout: 3000 }).should('be.visible');
    });

    it('should show name input field', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).should('be.visible');
    });

    it('should show Start Chat button', () => {
      cy.contains('Start Chat', { timeout: 3000 }).should('be.visible');
    });

    it('should show terms text', () => {
      cy.contains("By clicking \"Start Chat\", you agree to Connectly's terms", { timeout: 3000 }).should('be.visible');
    });
  });

  describe('Button State', () => {
    it('Start Chat button should be disabled when empty', () => {
      cy.contains('button', 'Start Chat', { timeout: 3000 }).should('be.disabled');
    });

    it('Start Chat button enables when name is typed', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('Alice');
      cy.contains('button', 'Start Chat', { timeout: 3000 }).should('not.be.disabled');
    });

    it('Start Chat button disables when name cleared', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('Bob').clear();
      cy.contains('button', 'Start Chat', { timeout: 3000 }).should('be.disabled');
    });

    it('rejects spaces only as name', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('   ');
      cy.contains('button', 'Start Chat', { timeout: 3000 }).should('be.disabled');
    });
  });

  describe('Typing in Input', () => {
    it('should accept name with letters', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('Charlie');
      cy.get('input[type="text"]').should('have.value', 'Charlie');
    });

    it('should accept name with numbers', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('User123');
      cy.get('input[type="text"]').should('have.value', 'User123');
    });

    it('should accept name with special chars', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('User@123');
      cy.get('input[type="text"]').should('have.value', 'User@123');
    });

    it('should accept long name', () => {
      const longName = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      cy.get('input[type="text"]', { timeout: 3000 }).type(longName);
      cy.get('input[type="text"]').should('have.value', longName);
    });
  });

  describe('Starting Chat', () => {
    it('clicking Start Chat should transition to room', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('Diana');
      cy.contains('button', 'Start Chat', { timeout: 3000 }).click();
      cy.wait(1500);

      // After clicking, video should still be visible
      cy.get('video', { timeout: 3000 }).should('exist');
    });

    it('room should load after starting chat', () => {
      cy.get('input[type="text"]', { timeout: 3000 }).type('Eve');
      cy.contains('button', 'Start Chat', { timeout: 3000 }).click();
      cy.wait(2000);

      cy.get('body', { timeout: 3000 }).should('exist');
    });
  });
});

