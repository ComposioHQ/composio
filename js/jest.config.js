/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testTimeout: 60000,
    collectCoverage: true,
    coverageReporters: [
        "html"
    ],
    reporters: [
        "default"
    ],
};