import test from 'node:test';
import assert from 'node:assert/strict';

import { extractStatusCode, shouldSkipOptionalOutput } from '../e2e/tls-utils.mjs';

test('extractStatusCode reads 5xx from error output', () => {
  assert.equal(extractStatusCode('error code: 502'), 502);
  assert.equal(extractStatusCode('HTTP error: 503'), 503);
});

test('extractStatusCode returns null when no status present', () => {
  assert.equal(extractStatusCode('Success: ok'), null);
  assert.equal(extractStatusCode(''), null);
});

test('shouldSkipOptionalOutput returns true for 5xx only', () => {
  assert.equal(shouldSkipOptionalOutput('error code: 500'), true);
  assert.equal(shouldSkipOptionalOutput('status code 502'), true);
  assert.equal(shouldSkipOptionalOutput('error code: 404'), false);
});
