module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-jsdom', // Use jsdom for React components
  moduleNameMapper: {
    // Handle CSS imports (if you use CSS Modules or similar)
    '\.(css|less|scss|sass)$': 'identity-obj-proxy',
    // Handle Next.js path aliases if configured (e.g., "@/*")
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'], // Optional: for global test setup
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.jest.json', // Use a separate tsconfig for tests if needed
    },
  },
  transform: {
    '^.+\.(ts|tsx)$': 'ts-jest',
    '^.+\.(js|jsx)$': 'babel-jest', // If you have JS files to transform (e.g. in node_modules)
                                  // and have babel configured. For a pure TS project, ts-jest might be enough.
  },
  // Ignore Next.js build directory and node_modules for tests
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
};
