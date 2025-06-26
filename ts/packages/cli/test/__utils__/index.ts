import pkg from '../../package.json' with { type: 'json' };

export * as MockConsole from './services/mock-console';
export * as MockTerminal from './services/mock-terminal';
export { TestLayer as TestLive } from './services/test-layer';
export { cli } from './cli';
export { pkg };
