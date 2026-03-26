/**
 * @module __tests__/scd.test
 * Tests for the SCD Type 2 engine.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockNeonClient } from './mock-neon-client.js';
import { insertWithEffectiveDating, expireRow, getAsOf, getHistory } from '../db/scd.js';

describe('SCD Type 2 Engine', () => {
  const client = createMockNeonClient();

  beforeEach(() => {
    client._reset();
  });

  // ── insertWithEffectiveDating ────────────────────────────

  describe('insertWithEffectiveDating', () => {
    it('inserts a new row with SCD fields', async () => {
      const result = await insertWithEffectiveDating(client, 'items', 'key-1', {
        name: 'Widget',
        value: 42,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.natural_key).toBe('key-1');
      expect(result.value.is_current).toBe(true);
      expect(result.value.eff_end).toBeNull();
      expect(result.value.eff_start).toBeDefined();
      expect(result.value.surrogate_key).toMatch(/^sk_/);
    });

    it('sets correct data properties on the inserted row', async () => {
      const result = await insertWithEffectiveDating(client, 'items', 'key-2', {
        name: 'Gadget',
        price: 99.99,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.name).toBe('Gadget');
      expect(result.value.price).toBe(99.99);
    });

    it('expires old row on re-insert for same natural key', async () => {
      // Insert first version
      const first = await insertWithEffectiveDating(client, 'items', 'key-1', {
        name: 'Widget v1',
      });
      expect(first.ok).toBe(true);

      // Insert second version for same natural key
      const second = await insertWithEffectiveDating(client, 'items', 'key-1', {
        name: 'Widget v2',
      });
      expect(second.ok).toBe(true);

      // Check the in-memory store: first row should be expired
      const table = client._store.get('items');
      expect(table).toBeDefined();
      expect(table!.length).toBe(2);

      const firstRow = table![0]!;
      expect(firstRow.is_current).toBe(false);
      expect(firstRow.eff_end).toBeDefined();
      expect(firstRow.eff_end).not.toBeNull();

      const secondRow = table![1]!;
      expect(secondRow.is_current).toBe(true);
      expect(secondRow.eff_end).toBeNull();
      expect(secondRow.name).toBe('Widget v2');
    });

    it('does not expire rows with different natural keys', async () => {
      await insertWithEffectiveDating(client, 'items', 'key-A', { name: 'A' });
      await insertWithEffectiveDating(client, 'items', 'key-B', { name: 'B' });

      const table = client._store.get('items')!;
      expect(table.length).toBe(2);
      expect(table[0]!.is_current).toBe(true);
      expect(table[1]!.is_current).toBe(true);
    });
  });

  // ── expireRow ────────────────────────────────────────────

  describe('expireRow', () => {
    it('expires a row by surrogate key', async () => {
      const insertResult = await insertWithEffectiveDating(client, 'items', 'key-1', {
        name: 'Widget',
      });
      expect(insertResult.ok).toBe(true);
      if (!insertResult.ok) return;

      const surrogateKey = insertResult.value.surrogate_key;
      const result = await expireRow(client, 'items', surrogateKey);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.expired).toBe(true);

      // Verify in store
      const table = client._store.get('items')!;
      expect(table[0]!.is_current).toBe(false);
      expect(table[0]!.eff_end).not.toBeNull();
    });

    it('returns not_found for missing surrogate key', async () => {
      const result = await expireRow(client, 'items', 'nonexistent-sk');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('not_found');
    });

    it('returns not_found for already-expired row', async () => {
      const insertResult = await insertWithEffectiveDating(client, 'items', 'key-1', {
        name: 'Widget',
      });
      expect(insertResult.ok).toBe(true);
      if (!insertResult.ok) return;

      const sk = insertResult.value.surrogate_key;
      await expireRow(client, 'items', sk);

      // Try to expire again
      const result = await expireRow(client, 'items', sk);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('not_found');
    });
  });

  // ── getAsOf ──────────────────────────────────────────────

  describe('getAsOf', () => {
    it('returns correct version for a given date', async () => {
      // Manually build rows with known dates
      const table = [
        {
          surrogate_key: 'sk-1',
          natural_key: 'key-1',
          eff_start: '2024-01-01T00:00:00Z',
          eff_end: '2024-06-01T00:00:00Z',
          is_current: false,
          name: 'v1',
        },
        {
          surrogate_key: 'sk-2',
          natural_key: 'key-1',
          eff_start: '2024-06-01T00:00:00Z',
          eff_end: null,
          is_current: true,
          name: 'v2',
        },
      ];
      client._store.set('items', table);

      // Query as of March 2024 — should get v1
      const result1 = await getAsOf(client, 'items', 'key-1', '2024-03-15T00:00:00Z');
      expect(result1.ok).toBe(true);
      if (!result1.ok) return;
      expect(result1.value).not.toBeNull();
      expect(result1.value!.name).toBe('v1');

      // Query as of August 2024 — should get v2
      const result2 = await getAsOf(client, 'items', 'key-1', '2024-08-15T00:00:00Z');
      expect(result2.ok).toBe(true);
      if (!result2.ok) return;
      expect(result2.value).not.toBeNull();
      expect(result2.value!.name).toBe('v2');
    });

    it('returns null for date before any version', async () => {
      const table = [
        {
          surrogate_key: 'sk-1',
          natural_key: 'key-1',
          eff_start: '2024-06-01T00:00:00Z',
          eff_end: null,
          is_current: true,
          name: 'v1',
        },
      ];
      client._store.set('items', table);

      const result = await getAsOf(client, 'items', 'key-1', '2024-01-01T00:00:00Z');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeNull();
    });

    it('returns null for nonexistent natural key', async () => {
      const result = await getAsOf(client, 'items', 'no-such-key', '2024-06-01T00:00:00Z');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeNull();
    });
  });

  // ── getHistory ───────────────────────────────────────────

  describe('getHistory', () => {
    it('returns all versions ordered by eff_start', async () => {
      const table = [
        {
          surrogate_key: 'sk-2',
          natural_key: 'key-1',
          eff_start: '2024-06-01T00:00:00Z',
          eff_end: null,
          is_current: true,
          name: 'v2',
        },
        {
          surrogate_key: 'sk-1',
          natural_key: 'key-1',
          eff_start: '2024-01-01T00:00:00Z',
          eff_end: '2024-06-01T00:00:00Z',
          is_current: false,
          name: 'v1',
        },
      ];
      client._store.set('items', table);

      const result = await getHistory(client, 'items', 'key-1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.length).toBe(2);
      expect(result.value[0]!.name).toBe('v1'); // Earlier eff_start first
      expect(result.value[1]!.name).toBe('v2');
    });

    it('returns empty array for nonexistent natural key', async () => {
      const result = await getHistory(client, 'items', 'no-such-key');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBe(0);
    });

    it('returns single version when only one exists', async () => {
      const table = [
        {
          surrogate_key: 'sk-1',
          natural_key: 'key-1',
          eff_start: '2024-01-01T00:00:00Z',
          eff_end: null,
          is_current: true,
          name: 'only-version',
        },
      ];
      client._store.set('items', table);

      const result = await getHistory(client, 'items', 'key-1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBe(1);
      expect(result.value[0]!.name).toBe('only-version');
    });
  });
});
