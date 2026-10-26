// Main entry stays test-runner-agnostic (importable from tsx / plain node).
// Vitest-flavored assertion helpers are available via the './assertions' subpath.
export * from './test-postgres.js';
