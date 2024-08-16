/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testTimeout: 6000000,
    collectCoverage: true,
    coverageReporters: [
        "html"
    ],
    reporters: [
        "default",
        "jest-html-reporters"
    ],
};