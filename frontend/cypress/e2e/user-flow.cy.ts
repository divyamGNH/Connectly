describe('Landing and media permissions', () => {
  it('requires a nonblank name and live media before joining', () => {
    cy.visit('/');
    cy.contains('FLUELY').should('be.visible');
    cy.contains('Camera and microphone ready.').should('be.visible');
    cy.contains('button', 'Start Chat').should('be.disabled');
    cy.get('input[type="text"]').type('   ');
    cy.contains('button', 'Start Chat').should('be.disabled');
    cy.get('input[type="text"]').clear().type('Alice');
    cy.contains('button', 'Start Chat').should('be.enabled');
    cy.get('video').should(video => {
      const element = video[0] as HTMLVideoElement;
      expect((element.srcObject as MediaStream).getVideoTracks()[0].readyState).to.equal('live');
    });
    cy.contains('button', 'Start Chat').click();
    cy.get('[data-testid="connection-status"]').should('contain', 'Waiting for a partner');
    cy.contains('button', 'NEXT').should('be.disabled');
    cy.get('[data-testid="speaking-score"]').should('contain', 'Waiting for a partner');
  });

  it('reports permission denial, prevents joining, and retries successfully', () => {
    let denied = true;
    cy.visit('/', { onBeforeLoad(win) {
      const original = win.navigator.mediaDevices.getUserMedia.bind(win.navigator.mediaDevices);
      cy.stub(win.navigator.mediaDevices, 'getUserMedia').callsFake((constraints: MediaStreamConstraints) =>
        denied ? Promise.reject(new win.DOMException('Denied', 'NotAllowedError')) : original(constraints));
    } });
    cy.get('input[type="text"]').type('Alice');
    cy.contains('Camera or microphone unavailable.').should('be.visible');
    cy.contains('button', 'Start Chat').should('be.disabled');
    cy.then(() => { denied = false; });
    cy.contains('button', 'Try again').click();
    cy.contains('Camera and microphone ready.').should('be.visible');
    cy.contains('button', 'Start Chat').should('be.enabled');
  });
});
