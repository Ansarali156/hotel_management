// Global test setup — runs after Jest test framework is installed, before each test file.
// Clears all mocks between tests to prevent state leakage.

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});
