module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  collectCoverageFrom: [
    'middleware/auth.js',
    'controllers/bookings.js'
  ]
};
