import { createPartner } from '../support/partner';
import type { Partner } from '../support/partner';

describe('Real room chat and media controls', () => {
  let partner: Partner;
  beforeEach(() => {
    cy.loginToApp('Alice');
    cy.window().then(async win => { partner = await createPartner(win); });
    cy.get('[data-testid="connection-status"]').should('have.text', 'Connected');
  });
  afterEach(() => { partner?.close(); });

  it('routes sent messages once, right-aligns self and left-aligns partner', () => {
    cy.sendMessage('Hello partner');
    cy.get('[role="log"]').contains('p', 'Hello partner').parent().parent().should('have.class', 'justify-end');
    cy.get('input[aria-label="Message"]').should('have.value', '');
    cy.wrap(null).should(() => {
      expect(partner.messages.map(message => message.text)).to.deep.equal(['Hello partner']);
    });
    cy.then(() => { partner.send('Hello Alice'); });
    cy.get('[role="log"]').contains('p', 'Hello Alice').parent().parent().should('have.class', 'justify-start');
    cy.get('[role="log"]').should('contain', 'Test partner');
    cy.get('input[aria-label="Message"]').type('Second message{enter}');
    cy.wrap(null).should(() => { expect(partner.messages).to.have.length(2); });
    cy.get('input[aria-label="Message"]').type('   {enter}');
    cy.get('[role="log"] p').should('have.length', 3);
  });

  it('changes the actual camera and microphone track enabled states', () => {
    cy.get('button[aria-label="Turn camera off"]').click();
    cy.contains('Camera off').should('be.visible');
    cy.get('video').eq(1).should(video => {
      expect(((video[0] as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0].enabled).to.equal(false);
    });
    cy.get('button[aria-label="Turn camera on"]').click();
    cy.contains('Camera off').should('not.exist');
    cy.get('button[aria-label="Mute microphone"]').click();
    cy.get('[data-testid="speaking-score"]').should('contain', 'Microphone muted');
    cy.get('button[aria-label="Unmute microphone"]').click();
    cy.get('[data-testid="speaking-score"]').should('not.contain', 'Microphone muted');
    cy.then(() => { expect(partner.errors).to.deep.equal([]); });
  });
});
