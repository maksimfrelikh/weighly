import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildMeta, DEFAULT_LIMIT, MAX_LIMIT, parseLimit, parseOffset } from './pagination.ts';

describe('pagination — parseLimit (BUG-REG-048)', () => {
  it('returns default when value is undefined', () => {
    assert.equal(parseLimit(undefined), DEFAULT_LIMIT);
  });

  it('returns default when value is empty string', () => {
    assert.equal(parseLimit(''), DEFAULT_LIMIT);
  });

  it('returns default when value is null', () => {
    assert.equal(parseLimit(null as unknown as undefined), DEFAULT_LIMIT);
  });

  it('parses numeric string', () => {
    assert.equal(parseLimit('25'), 25);
  });

  it('parses raw number', () => {
    assert.equal(parseLimit(75), 75);
  });

  it('clamps values above MAX_LIMIT to MAX_LIMIT', () => {
    assert.equal(parseLimit('500'), MAX_LIMIT);
    assert.equal(parseLimit(9999), MAX_LIMIT);
  });

  it('returns default for zero', () => {
    assert.equal(parseLimit('0'), DEFAULT_LIMIT);
  });

  it('returns default for negative', () => {
    assert.equal(parseLimit('-5'), DEFAULT_LIMIT);
  });

  it('returns default for NaN', () => {
    assert.equal(parseLimit('abc'), DEFAULT_LIMIT);
  });

  it('truncates fractional values', () => {
    assert.equal(parseLimit('25.7'), 25);
  });

  it('honors custom default and max', () => {
    assert.equal(parseLimit(undefined, 10, 50), 10);
    assert.equal(parseLimit('100', 10, 50), 50);
  });

  it('accepts exactly MAX_LIMIT (200)', () => {
    assert.equal(parseLimit('200'), 200);
  });
});

describe('pagination — parseOffset (BUG-REG-048)', () => {
  it('returns 0 for undefined (backward compat: ?limit=N with no offset)', () => {
    assert.equal(parseOffset(undefined), 0);
  });

  it('returns 0 for empty string', () => {
    assert.equal(parseOffset(''), 0);
  });

  it('returns 0 for null', () => {
    assert.equal(parseOffset(null as unknown as undefined), 0);
  });

  it('parses numeric string', () => {
    assert.equal(parseOffset('40'), 40);
  });

  it('parses raw number', () => {
    assert.equal(parseOffset(100), 100);
  });

  it('returns 0 for negative offset', () => {
    assert.equal(parseOffset('-1'), 0);
  });

  it('returns 0 for NaN', () => {
    assert.equal(parseOffset('foo'), 0);
  });

  it('truncates fractional values', () => {
    assert.equal(parseOffset('40.9'), 40);
  });

  it('accepts very large offsets (no max clamp)', () => {
    assert.equal(parseOffset('100000'), 100000);
  });
});

describe('pagination — buildMeta (BUG-REG-048)', () => {
  it('returns { total, limit, offset } envelope shape', () => {
    const meta = buildMeta(137, 20, 40);
    assert.deepEqual(meta, { total: 137, limit: 20, offset: 40 });
    assert.deepEqual(Object.keys(meta), ['total', 'limit', 'offset']);
  });

  it('handles zero total', () => {
    assert.deepEqual(buildMeta(0, 50, 0), { total: 0, limit: 50, offset: 0 });
  });
});

describe('pagination — backward-compat: ?limit=N alone still works (BUG-REG-048)', () => {
  it('parses ?limit=20 with no offset → limit=20, offset=0', () => {
    const limit = parseLimit('20');
    const offset = parseOffset(undefined);
    assert.equal(limit, 20);
    assert.equal(offset, 0);
  });

  it('parses no params → default limit, offset=0', () => {
    const limit = parseLimit(undefined);
    const offset = parseOffset(undefined);
    assert.equal(limit, DEFAULT_LIMIT);
    assert.equal(offset, 0);
  });
});
