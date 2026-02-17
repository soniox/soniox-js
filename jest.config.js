/** Shared settings reused by every Jest project. */
const shared = {
  preset: 'ts-jest',
  setupFiles: ['dotenv/config'],
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  moduleNameMapper: {
    '^@soniox/core$': '<rootDir>/packages/core/src',
    '^@soniox/core/(.*)$': '<rootDir>/packages/core/src/$1',
    '^@soniox/node$': '<rootDir>/packages/node/src',
    '^@soniox/node/(.*)$': '<rootDir>/packages/node/src/$1',
    '^@soniox/client$': '<rootDir>/packages/client/src',
    '^@soniox/client/(.*)$': '<rootDir>/packages/client/src/$1',
    '^@soniox/react$': '<rootDir>/packages/react/src',
    '^@soniox/react/(.*)$': '<rootDir>/packages/react/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.jest.json',
      },
    ],
  },
  clearMocks: true,
  restoreMocks: true,
};

/** @type {import('jest').Config} */
module.exports = {
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/index.ts',
    '!packages/*/src/**/typedoc-entry.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // coverageThreshold: {
  //   global: {
  //     branches: 80,
  //     functions: 80,
  //     lines: 80,
  //     statements: 80,
  //   },
  // },
  projects: [
    {
      ...shared,
      displayName: 'core',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/packages/core'],
    },
    {
      ...shared,
      displayName: 'node',
      testEnvironment: 'node',
      roots: ['<rootDir>/packages/node'],
    },
    {
      ...shared,
      displayName: 'client',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/packages/client'],
    },
    {
      ...shared,
      displayName: 'react',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/packages/react'],
    },
    {
      ...shared,
      displayName: 'examples',
      testEnvironment: 'node',
      roots: ['<rootDir>/examples'],
    },
  ],
};
