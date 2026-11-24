// Runs before any test module is imported (setupFiles).
// Keep NODE_ENV=development so the rate limiter stays disabled in tests —
// suites make more requests than the production limits allow.
process.env.NODE_ENV = 'development';
