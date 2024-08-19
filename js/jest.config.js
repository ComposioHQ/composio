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
        ["jest-html-reporters", {
            "pageTitle": "Composio SDK Coverage Report",
            "publicPath": "./html-report",
            "filename": "report.html",
            "includeConsoleLog": true,
            "includeTestCoverage": true,
            "includeTime": true,
            "showSummary": true,
            "showTable": true,
        }]
    ],
    "coveragePathIgnorePatterns": [
        "src/sdk/client/*",
        "src/env/*",
        "src/sdk/testUtils/*",
        "config/*",
    ]
};