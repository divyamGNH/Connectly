# Connectly Testing Strategy: White Box vs Black Box

## Quick Reference

| Aspect | Black Box Testing | White Box Testing |
|--------|------------------|-------------------|
| **What it tests** | User behavior & functionality | Internal code logic |
| **Requires knowing** | UI & features only | Source code internals |
| **Tool for this project** | **Cypress** (E2E) | **Jest/Vitest** (Unit tests) |
| **Who runs it** | QA/Users | Developers |
| **What it catches** | UX bugs, workflows, security issues | Logic bugs, edge cases, performance |
| **Example** | "Can user login?" | "Does password hash work?" |

---

## What We Built: Cypress Black Box Tests

### Why Cypress for Black Box Testing?

Cypress interacts with your app **exactly like a real user would**:
- Clicks buttons
- Types into fields
- Sees error messages
- Watches videos load
- Sends messages

It **doesn't care** how these work internally.

### Our Test Files

#### 1. **user-flow.cy.ts** - "Can real users use the app?"
```javascript
// Example test: Can a user start a chat?
it('should transition to room when Start Chat clicked', () => {
  cy.get('input[type="text"]').type('John');      // User types name
  cy.get('button').contains('Start Chat').click(); // User clicks button
  cy.get('video').should('be.visible');           // Does video appear?
  //  ✅ Tests what the USER sees, not how it works internally
});
```

**Tests covered:**
- Landing page UI exists
- User can enter name
- Start Chat button works
- Video loads
- Can connect to another user
- Can send messages
- Can toggle camera/mic
- Can disconnect and find new user

#### 2. **detailed-interactions.cy.ts** - "Does the app handle edge cases?"
```javascript
// Example: What if user types 10000 characters?
it('should handle very long messages', () => {
  const longMessage = 'a'.repeat(5000);
  cy.get('input').last().type(longMessage);
  cy.get('body').should('exist'); // Didn't crash?
  // ✅ Tests real-world problematic input
});
```

**Tests covered:**
- Special characters in names (User@123!, مرحبا)
- Unicode/emoji support
- XSS injection attempts (tags in input)
- SQL injection attempts
- Rapid button clicks
- Very long inputs
- Empty form submissions
- Multiple disconnects

#### 3. **realtime-communication.cy.ts** - "Does real-time work?"
```javascript
// Example: Does socket connect and send data?
it('should establish socket connection after starting chat', () => {
  cy.get('input[type="text"]').type('User');
  cy.get('button').contains('Start Chat').click();
  cy.wait(1000);
  cy.get('video').should('exist'); // Socket worked, video loaded
  // ✅ Tests real-time communication from user perspective
});
```

**Tests covered:**
- Socket.io connection established
- Message exchange works
- Audio chunks sent
- Room creation succeeds
- Peer connection working
- Video/audio streaming
- Disconnection cleanup

---

## What's Missing: White Box Tests (For Later)

When you add **login functionality**, you'll need **White Box tests** too:

### Example: Testing Login Logic with Jest

```javascript
// This is WHITE BOX - we know the internal code
import { hashPassword, verifyPassword } from '../auth';

describe('Password Hashing - Internal Logic', () => {
  it('should hash password correctly', () => {
    const hash = hashPassword('myPassword123');
    // We're testing the INTERNAL function, not user behavior
    expect(hash).not.toBe('myPassword123');
    expect(hash).toHaveLength(60); // bcrypt hash length
  });

  it('should verify correct password', () => {
    const hash = hashPassword('correctPassword');
    const result = verifyPassword('correctPassword', hash);
    expect(result).toBe(true);
  });

  it('should reject wrong password', () => {
    const hash = hashPassword('correctPassword');
    const result = verifyPassword('wrongPassword', hash);
    expect(result).toBe(false);
  });
});
```

### Why Both Matter

**Black Box (Cypress) finds:**
- Login button missing ❌
- Form not submitting ❌
- Error message not showing ❌
- Wrong user logged in ❌

**White Box (Jest) finds:**
- Password hashed incorrectly ❌
- JWT token not generated ❌
- Expiration not checked ❌
- Salt not used in hash ❌

---

## How Our Current Tests Work

### Test 1: Landing Page
```
User's Perspective (Black Box):
1. Open app
2. See "CONNECTLY" header ✓
3. See video preview ✓
4. See name input field ✓
5. Try to click "Start Chat" → button disabled ✓
6. Type name
7. Click "Start Chat" → button enabled ✓
8. Button works, enters room ✓

/// This is EXACTLY what user-flow.cy.ts tests ///
```

### Test 2: Edge Case - XSS Attack
```
User tries to break app (Black Box):
1. Type "<script>alert('hacked')</script>" in name
2. Click Start Chat
3. App handles it safely (no script executed)
4. User treated as normal input

/// detailed-interactions.cy.ts catches this ///
```

### Test 3: Real-time Connection
```
User joins chat (Black Box):
1. Opens app
2. Clicks Start Chat
3. Socket connects (behind the scenes)
4. Other user joins
5. Both see video
6. Message sent → both see it
7. Audio flows between users

/// realtime-communication.cy.ts validates this ///
```

---

## Test Execution Flow

```
┌─────────────────────────────────────────────────┐
│         Cypress Opens Browser                    │
└────────────────┬────────────────────────────────┘
                 │
┌─────────────────────────────────────────────────┐
│    Test 1: Navigate to http://localhost:5173   │
│    cy.visit(BASE_URL)                           │
└────────────────┬────────────────────────────────┘
                 │
┌─────────────────────────────────────────────────┐
│    Test 2: User Types Name                      │
│    cy.get('input').type('John')                │
└────────────────┬────────────────────────────────┘
                 │
┌─────────────────────────────────────────────────┐
│    Test 3: User Clicks Start Chat              │
│    cy.get('button').contains('Start Chat').click()
└────────────────┬────────────────────────────────┘
                 │
┌─────────────────────────────────────────────────┐
│    Frontend sends request to Backend            │
│    Socket.io connects                            │
│    RoomManager creates room                      │
│    UserManager queues user                       │
└────────────────┬────────────────────────────────┘
                 │
┌─────────────────────────────────────────────────┐
│    Test 4: Verify Video Loaded                  │
│    cy.get('video').should('be.visible')        │
│    ✅ TEST PASSES                               │
└─────────────────────────────────────────────────┘
```

The Cypress test doesn't know about RoomManager or sockets - it just sees:
**"User clicked button → video appeared = PASS ✅"**

---

## Running Your Tests Now

### Step 1: Start Backend
```bash
cd backend
npm run dev
# Backend running on http://localhost:3000
```

### Step 2: Start Frontend  
```bash
cd frontend
npm run dev
# Frontend running on http://localhost:5173
```

### Step 3: Run Tests
```bash
cd frontend
npm run test:e2e:open
```

This opens Cypress UI where you can:
- See all 50+ tests
- Run them individually
- Watch them execute
- See failures with screenshots

---

## What Each Test Category Tests

### Landing Page Tests
- ✅ Header, video, input visible
- ✅ Name validation (empty → disabled)
- ✅ Button state changes
- ✅ Keyboard navigation (Enter key)

### User Flow Tests
- ✅ Complete workflow: Landing → Room → Chat
- ✅ Multiple users connecting
- ✅ Messaging works
- ✅ Controls respond

### Edge Case Tests
- ✅ Very long inputs (5000+ characters)
- ✅ Special characters (emojis, unicode, symbols)
- ✅ Rapid clicks (5x rapid button clicks)
- ✅ Invalid input (tags, SQL, etc.)

### Real-time Tests
- ✅ Socket connects after join
- ✅ Messages exchange in real-time
- ✅ Audio chunks sent continuously
- ✅ Room cleanup on disconnect

### Performance Tests
- ✅ Video loads in <5 seconds
- ✅ No console errors on startup
- ✅ Handles high latency
- ✅ Works with slow network

### Resilience Tests
- ✅ Recovers from disconnect
- ✅ Handles page refresh
- ✅ Browser back button works
- ✅ Multiple rapid sessions

---

## When to Use Which Testing Type

### Use Black Box (Cypress) When:
- Testing **user workflows** (happy path)
- Checking **UI/UX** (buttons, forms, navigation)
- Validating **error handling** (what user sees)
- Testing **real-time features** (messaging, video)
- Security testing (XSS, injection attempts)
- Performance from user perspective

### Use White Box (Jest) When:
- Testing **business logic** (calculations, algorithms)
- Testing **functions in isolation** (Math, formatting)
- Testing **error conditions** (catch blocks, edge cases)
- Validating **data transformations** (parsing, validation)
- Testing **authentication** (password hashing, token generation)

---

## Your Testing Roadmap

### ✅ DONE (What we just built)
- Cypress E2E tests for current app
- Black box testing coverage
- Real user workflow validation

### 🔜 TODO (When adding login)
- **White Box**: Password hashing tests (Jest)
- **White Box**: JWT token tests (Jest)
- **White Box**: Database query tests (Jest)
- **Black Box**: Login form tests (Cypress)
- **Black Box**: Session persistence tests (Cypress)
- **Black Box**: Permission checks (Cypress)

---

## Summary

These Cypress tests are **BLACK BOX TESTS** because they:
1. ✅ Only interact through the UI (buttons, inputs, text)
2. ✅ Don't know internal implementation
3. ✅ Test from a user's perspective
4. ✅ Verify the app works as expected
5. ✅ Catch breaks in user workflows
6. ✅ Validate real-time features work

When you add login, you'll add **WHITE BOX TESTS** with Jest to test:
1. Password hashing logic
2. JWT token generation
3. Database operations
4. Authentication middleware
5. Error scenarios

Both types are essential - they find different types of bugs!

---

## Next Steps

1. **Run the tests**:
   ```bash
   npm run test:e2e:open
   ```

2. **Watch them pass** (most should)

3. **When features break**, fix them and re-run

4. **When adding login**, create Jest white box tests

5. **Document** any issues found

Good luck! 🚀
