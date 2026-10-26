# Connectly E2E Testing Guide (Black Box Testing)

## Overview

This project includes comprehensive **end-to-end (E2E) tests** using **Cypress** to validate the Connectly application from a user's perspective. These are **black box tests** - they don't rely on internal implementation details, only on what users see and interact with.

## Test Structure

### Test Files

1. **`cypress/e2e/user-flow.cy.ts`** - Core user workflows
   - Landing page UI validation
   - Name input validation
   - Starting chat flow
   - Camera/microphone controls
   - Two users connecting
   - Messaging functionality
   - Disconnection handling
   - Browser refresh scenarios
   - Error edge cases
   - Accessibility checks

2. **`cypress/e2e/detailed-interactions.cy.ts`** - Detailed user interactions
   - Message sending with various inputs
   - Rapid button clicks and form submissions
   - Multi-tab scenarios
   - Device orientation changes
   - Input sanitization (XSS, SQL injection, etc.)
   - UI state consistency
   - Form validation

3. **`cypress/e2e/realtime-communication.cy.ts`** - Real-time features
   - Socket.io connection establishment
   - Message exchange
   - Audio stream processing
   - Room management and user matching
   - WebRTC peer communication
   - Score/analytics updates
   - Connection resilience
   - High latency handling

### Support Files

- **`cypress/support/e2e.ts`** - Global test setup and hooks
- **`cypress/support/commands.ts`** - Custom Cypress commands for common operations
- **`cypress.config.ts`** - Cypress configuration

## Running Tests

### Prerequisites

1. **Install Cypress** (should be done already):
   ```bash
   npm install --save-dev cypress
   ```

2. **Start the development server** (in one terminal):
   ```bash
   npm run dev
   ```
   The app should be running on `http://localhost:5173`

3. **Start the backend** (in another terminal):
   ```bash
   cd ../backend
   npm run dev
   ```
   Backend should run on `http://localhost:3000`

### Run All Tests

Open Cypress Test Runner (interactive mode):
```bash
npm run test:e2e:open
```

This opens the Cypress UI where you can:
- See all tests
- Click to run individual tests
- Watch tests execute in real-time
- Debug failures

### Run Specific Test Suites

#### All E2E tests (headless):
```bash
npm run test:e2e
```

#### User flow tests only:
```bash
npm run test:e2e:user-flow
```

#### Detailed interactions only:
```bash
npm run test:e2e:interactions
```

#### Real-time communication only:
```bash
npm run test:e2e:realtime
```

#### Headless mode (no UI):
```bash
npm run test:e2e:headless
```

## Test Categories Explained

### Black Box Testing Approach

These tests simulate **real user behavior** without knowing how the code works internally:

#### 1. **Landing Page Tests**
- ✅ User sees header, video, input field
- ✅ Name field is empty → button is disabled
- ✅ User types name → button enables
- ✅ Click "Start Chat" → enters room

#### 2. **Validation Tests**
- ✅ Empty name → button disabled
- ✅ Only spaces → button disabled
- ✅ Special characters → accepted
- ✅ Unicode/emoji → accepted
- ✅ Very long names → handled gracefully

#### 3. **Control Tests**
- ✅ Camera button exists
- ✅ Microphone button exists
- ✅ Buttons toggle settings
- ✅ Multiple quick toggles → no crash

#### 4. **Connection Tests**
- ✅ User joins → waiting state
- ✅ Second user joins → both see video
- ✅ Message sent → appears
- ✅ Next button → finds new partner

#### 5. **Edge Cases**
- ✅ Refresh page during chat → back to landing
- ✅ Close tab → cleanup happens
- ✅ Network interruption → recovers
- ✅ Rapid clicks → single action processed
- ✅ Invalid input → sanitized

#### 6. **Performance Tests**
- ✅ Video loads within 5 seconds
- ✅ No console errors on startup
- ✅ Handles high latency
- ✅ Slow network → still works

## Key Testing Strategies

### 1. **UI Interaction Testing**
Tests focus on what users see and click:
```javascript
cy.get('input[type="text"]').type('UserName');
cy.get('button').contains('Start Chat').click();
cy.get('video').should('be.visible');
```

### 2. **State Management**
Tests verify the app maintains correct states:
- Landing → Join → Room → Lobby → Room sequence
- Button enabled/disabled at right times
- Video visible/hidden as expected

### 3. **Error Resilience**
Tests ensure app handles problems gracefully:
- Network failures
- Invalid input
- Rapid user actions
- Missing media permissions

### 4. **Real-world Scenarios**
Tests simulate actual user behavior:
- Typing while connecting
- Toggling camera while talking
- Page refresh during chat
- Switching between windows

## Custom Commands

The tests use custom Cypress commands for common operations:

```javascript
// Simple login
cy.loginToApp('UserName');

// Control media
cy.toggleCamera();
cy.toggleMicrophone();

// Send messages
cy.sendMessage('Hello!');

// Find buttons
cy.clickButton('Start Chat');

// Wait for elements
cy.waitForVideo();
cy.waitForElementToDisappear('button');

// Type slowly (more natural)
cy.typeSlowly('Natural typing speed...');
```

See `cypress/support/commands.ts` for all available commands.

## Debugging Failed Tests

### In Cypress UI:
1. Click on the failed test
2. Step through each command
3. Hover over commands to see snapshots
4. Use Developer Tools tab to inspect elements
5. Check "Selector" field to debug selectors

### Common Issues:

**"Element not found"**
- Check if element exists in the DOM
- Verify selectors are correct
- Increase timeout: `.should('exist', { timeout: 15000 })`

**"Button is disabled"**
- Verify preconditions (name entered, etc.)
- Check input value: `.should('have.value', 'text')`

**"Timeout waiting for video"**
- Backend might not be running
- Camera permissions denied
- Network connectivity issue

**"Socket didn't connect"**
- Backend not running on port 3000
- CORS issues between frontend/backend
- Check backend console for errors

## Test Configuration

Edit `cypress.config.ts` to adjust:

```typescript
baseUrl: 'http://localhost:5173'        // App URL
defaultCommandTimeout: 10000            // Command timeout (ms)
video: true                             // Record videos
videoCompression: 32                    // Video quality
viewportWidth: 1280                     // Screen size
viewportHeight: 720
```

## Best Practices for Writing New Tests

1. **Test Like a User**
   - Don't inspect internal state
   - Only interact through UI
   - Use visible text, not internal IDs

2. **Make Tests Independent**
   - Each test should work alone
   - Don't depend on test order
   - Clean up after yourself

3. **Use Clear Names**
   ```javascript
   it('should show video after clicking Start Chat', () => {
     // Good - describes what happens
   });
   ```

4. **Avoid Hard Waits**
   ```javascript
   // Bad
   cy.wait(5000);

   // Good
   cy.get('video').should('be.visible');
   ```

5. **Handle Dynamic Content**
   ```javascript
   // Good - works even if exact text changes
   cy.get('button').contains('Start', { matchCase: false }).click();
   ```

## Continuous Integration

To run tests in CI/CD pipeline:

```bash
# Start server in background
npm run dev &

# Wait for server
sleep 5

# Run tests
npm run test:e2e:headless

# Kill server
pkill -f "vite"
```

## Test Reliability

These tests are designed to be **reliable**:
- Avoid random waits (use proper waits)
- Retry on failure (configured in cypress.config.ts)
- Handle race conditions
- Test cross-browser compatible (Chrome, Firefox, Edge)

## Coverage

The tests cover:
- ✅ **Happy path**: Normal user workflow
- ✅ **Error cases**: Invalid input, network issues
- ✅ **Edge cases**: Rapid clicks, long names, special characters
- ✅ **Performance**: Load times, responsiveness
- ✅ **Accessibility**: Keyboard navigation, button states
- ✅ **Resilience**: Network interruption, page refresh

## Next Steps

1. **Run the tests**:
   ```bash
   npm run test:e2e:open
   ```

2. **Watch them pass** (or fail - and debug!)

3. **Add more tests** as you add features

4. **Use in CI/CD** for continuous validation

## Resources

- [Cypress Docs](https://docs.cypress.io)
- [Best Practices](https://docs.cypress.io/guides/references/best-practices)
- [Custom Commands](https://docs.cypress.io/api/cypress-api/custom-commands)
- [Debugging Guide](https://docs.cypress.io/guides/guides/debugging)

## Questions?

Check the test files for examples - they're well-commented and show various testing patterns.
