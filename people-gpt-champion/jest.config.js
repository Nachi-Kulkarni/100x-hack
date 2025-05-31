// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: { // If using path aliases like @/lib
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/pages/(.*)$': '<rootDir>/pages/$1',
    // Adjust if your aliases are different, e.g. people-gpt-champion/lib/*
    // This assumes tests are run from the 'people-gpt-champion' directory as root.
    // If tests are run from '/app', then paths might need to be '<rootDir>/people-gpt-champion/lib/$1'
    // Given npm install was run in /app/people-gpt-champion, <rootDir> should be /app/people-gpt-champion
  },
  setupFilesAfterEnv: ['./jest.setup.js'], // Optional: for global setup
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
};
