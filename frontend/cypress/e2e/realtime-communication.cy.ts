import { createPartner, emitToRoom } from '../support/partner';
import type { Partner } from '../support/partner';

describe('WebRTC media and room lifecycle', () => {
  let partner: Partner;
  beforeEach(() => {
    cy.loginToApp('Alice');
    cy.window().then(async win => { partner = await createPartner(win); });
    cy.get('[data-testid="connection-status"]').should('have.text', 'Connected');
  });
  afterEach(() => { partner?.close(); });

  it('establishes a real peer connection and receives playable remote media', () => {
    cy.get('video').eq(0).should(video => {
      const element = video[0] as HTMLVideoElement;
      const stream = element.srcObject as MediaStream;
      expect(stream.getAudioTracks()).to.have.length(1);
      expect(stream.getVideoTracks()).to.have.length(1);
      expect(element.readyState).to.be.greaterThan(1);
    });
    cy.wrap(null).should(() => { expect(partner.state()).to.equal('connected'); expect(partner.errors).to.deep.equal([]); });
  });

  it('NEXT creates a new room, clears chat and ignores stale messages and scores', () => {
    let oldRoom: string;
    cy.sendMessage('Old conversation');
    cy.then(() => { oldRoom = partner.roomId(); });
    cy.contains('button', 'NEXT').click();
    cy.get('[data-testid="connection-status"]').should('have.text', 'Connected');
    cy.wrap(null).should(() => { expect(partner.roomId()).not.to.equal(oldRoom); });
    cy.get('[role="log"]').should('not.contain', 'Old conversation');
    cy.then(() => emitToRoom(partner.roomId(), 'receive-message', { roomId: oldRoom, text: 'STALE MESSAGE' }));
    cy.then(() => emitToRoom(partner.roomId(), 'live-score-update', { roomId: oldRoom, score: 10, review: 'STALE SCORE' }));
    cy.then(() => emitToRoom(partner.roomId(), 'final-score', { roomId: oldRoom, score: 10, review: 'STALE FINAL' }));
    cy.get('[role="log"]').should('not.contain', 'STALE MESSAGE');
    cy.get('[data-testid="speaking-score"]').should('not.contain', 'STALE');
    cy.then(() => { partner.send('New conversation'); });
    cy.get('[role="log"]').should('contain', 'New conversation');
  });

  it('returns the survivor to the lobby when the partner disconnects', () => {
    cy.then(() => { partner.close(); });
    cy.get('[data-testid="connection-status"]').should('contain', 'Waiting for a partner');
    cy.contains('button', 'NEXT').should('be.disabled');
    cy.get('video').eq(0).should(video => { expect((video[0] as HTMLVideoElement).srcObject).to.equal(null); });
  });
});
