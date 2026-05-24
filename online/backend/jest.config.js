/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@shared/(.*)$': '<rootDir>/../shared/src/$1',
    '^@insider-trading/shared$': '<rootDir>/../shared/src/index.ts',
    '^@insider-trading/shared/(.*)$': '<rootDir>/../shared/src/$1'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json' }]
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  rootDir: '.'
};
