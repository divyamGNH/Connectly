# Test strategy

Use backend unit tests for room membership, queue and score behavior; real-socket integration tests for the server contract; WebRTC tests with a controlled peer for timing and recovery; and Cypress with a real second browser peer for visible workflows and media delivery.

The browser harness runs only on loopback and mocks speech evaluation. API unit tests replace Axios. Application exceptions fail browser tests, each test is isolated and retries are disabled. Synthetic devices remove hardware dependency. Final hardware, deployment/TURN and live API checks remain manual.

See [the project testing guide](../TESTING.md) for commands and exact coverage.
