import { createPartner, emitToRoom } from '../support/partner';
import type { Partner } from '../support/partner';

describe('Speech feedback states and recording', () => {
  let partner: Partner;
  beforeEach(() => {
    cy.loginToApp('Alice');
    cy.window().then(async win => { partner = await createPartner(win); });
    cy.get('[data-testid="connection-status"]').should('have.text', 'Connected');
  });
  afterEach(() => { partner?.close(); });

  it('records a real audio clip and displays the isolated test evaluator result', () => {
    cy.get('[data-testid="speaking-score"]').should('contain', 'Listening');
    cy.get('[data-testid="speaking-score"]', { timeout: 20000 }).should('contain', 'Live: 7.5/10');
    cy.get('[data-testid="speaking-score"]').should('contain', 'Clear ideas; vary sentence structure.');
  });

  it('shows processing, service error, recovered live feedback and final feedback', () => {
    cy.then(() => emitToRoom(partner.roomId(), 'score-status', { roomId: partner.roomId(), state: 'processing', message: 'Analyzing speech' }));
    cy.get('[data-testid="speaking-score"]').should('contain', 'Analyzing speech');
    cy.then(() => emitToRoom(partner.roomId(), 'score-status', { roomId: partner.roomId(), state: 'error', message: 'Service unavailable' }));
    cy.get('[data-testid="speaking-score"]').should('contain', 'Service unavailable');
    cy.then(() => emitToRoom(partner.roomId(), 'live-score-update', { roomId: partner.roomId(), score: 8, review: 'CURRENT LIVE' }));
    cy.get('[data-testid="speaking-score"]').should('contain', 'Live: 8/10').and('contain', 'CURRENT LIVE');
    cy.then(() => emitToRoom(partner.roomId(), 'final-score', { roomId: partner.roomId(), score: 8, review: 'CURRENT FINAL' }));
    cy.get('[data-testid="speaking-score"]').should('contain', 'Final Score: 8/10').and('contain', 'CURRENT FINAL');
  });
});
