import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/types/**'],
  coverageDirectory: 'coverage',
  // setupFiles runs BEFORE any module is imported — used to set env vars
  setupFiles: ['<rootDir>/tests/env.setup.ts'],
  // setupFilesAfterEnv runs after Jest framework loads — used for mock lifecycle hooks
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  moduleNameMapper: {
    // Replace native argon2 binary with a pure-JS mock (no compiled .node in test env)
    '^argon2$': '<rootDir>/tests/__mocks__/argon2.js',
    // Replace BullMQ with a no-op mock so tests run without a live Redis/BullMQ connection
    '^bullmq$': '<rootDir>/tests/__mocks__/bullmq.js',
  },
};

export default config;
