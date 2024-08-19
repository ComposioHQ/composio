/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testTimeout: 6000000,
    collectCoverage: true,
    coverageReporters: [
        "html",
        "text",
    ],
    reporters: [
        "default",
        "jest-html-reporters"
    ],
    "coveragePathIgnorePatterns": [
        "src/sdk/client/*",
        "src/env/*",
        "src/sdk/testUtils/*",
        "config/*",
    ]
};