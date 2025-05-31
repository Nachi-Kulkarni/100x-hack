// people-gpt-champion/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(next-auth|@next-auth/prisma-adapter|jose|@panva/hkdf|uuid|openid-client|@octokit|preact|preact-render-to-string|msw|@mswjs/interceptors|next)/)',
  ],
  moduleNameMapper: {
    // @next-auth/prisma-adapter still needs a mapper if not manually mocked in __mocks__
    // If a manual mock for @next-auth/prisma-adapter exists and works, this can be removed too.
    // For now, keeping it as per previous successful state for adapter resolution.
    '^@next-auth/prisma-adapter$': [
      '<rootDir>/node_modules/@next-auth/prisma-adapter/dist/index.js',
      '<rootDir>/node_modules/@next-auth/prisma-adapter/lib/index.js',
      '<rootDir>/node_modules/@next-auth/prisma-adapter/index.js'
    ],
    // NO entry for '^next-auth$' here, to allow manual mock to be picked up.
    // Path alias for @/
    '^@/(.*)$': '<rootDir>/$1',
    // CSS/Static file mocks
    '\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': '<rootDir>/__mocks__/fileMock.js',
    // Project specific mocks
    '^lib/redis$': '<rootDir>/lib/__mocks__/redis.ts',
    '^mocks/mockPrisma$': '<rootDir>/mocks/mockPrisma.ts',
    '^msw/node$': '<rootDir>/node_modules/msw/node/lib/index.js',
  },
  verbose: true,
};
