/**
 * @module __tests__/mock-neon-client
 * In-memory mock of NeonClient for unit testing.
 *
 * Intercepts SQL queries and operates on in-memory arrays.
 * Supports INSERT, UPDATE, SELECT with basic WHERE clause parsing.
 */
import type { NeonClient, QueryResult, Row } from '../db/neon-client.js';

/** A table is an array of mutable row objects */
type TableStore = Map<string, Row[]>;

/**
 * Create a mock NeonClient backed by in-memory arrays.
 * The mock parses SQL minimally to route to the correct in-memory table.
 */
export function createMockNeonClient(): NeonClient & {
  /** Direct access to the underlying store for test assertions */
  readonly _store: TableStore;
  /** Reset all tables */
  _reset(): void;
} {
  const store: TableStore = new Map();

  function getTable(name: string): Row[] {
    let table = store.get(name);
    if (!table) {
      table = [];
      store.set(name, table);
    }
    return table;
  }

  function parseTableName(sql: string): string {
    // Match INSERT INTO <table>, UPDATE <table>, SELECT ... FROM <table>
    const insertMatch = /INSERT\s+INTO\s+(\w+)/i.exec(sql);
    if (insertMatch?.[1]) return insertMatch[1];

    const updateMatch = /UPDATE\s+(\w+)/i.exec(sql);
    if (updateMatch?.[1]) return updateMatch[1];

    const fromMatch = /FROM\s+(\w+)/i.exec(sql);
    if (fromMatch?.[1]) return fromMatch[1];

    return 'unknown';
  }

  function evaluateWhere(
    row: Row,
    whereClause: string,
    params: readonly unknown[],
  ): boolean {
    if (!whereClause.trim()) return true;

    // Split on AND (simple approach)
    const conditions = whereClause.split(/\s+AND\s+/i);

    return conditions.every((cond) => {
      const trimmed = cond.trim();

      // Handle parenthesized OR groups FIRST: (eff_end IS NULL OR eff_end > $2)
      // Must come before IS NULL check to avoid false positive matches inside parens
      const orGroupMatch = /^\((.+)\)$/.exec(trimmed);
      if (orGroupMatch?.[1]) {
        const orParts = orGroupMatch[1].split(/\s+OR\s+/i);
        return orParts.some((part) => evaluateWhere(row, part.trim(), params));
      }

      // Handle IS NULL
      const isNullMatch = /(\w+)\s+IS\s+NULL/i.exec(trimmed);
      if (isNullMatch?.[1]) {
        return row[isNullMatch[1]] === null || row[isNullMatch[1]] === undefined;
      }

      // Handle IS NOT NULL
      const isNotNullMatch = /(\w+)\s+IS\s+NOT\s+NULL/i.exec(trimmed);
      if (isNotNullMatch?.[1]) {
        return row[isNotNullMatch[1]] !== null && row[isNotNullMatch[1]] !== undefined;
      }

      // Handle = with literal boolean: col = true / col = false
      const eqBoolMatch = /(\w+)\s*=\s*(true|false)\b/i.exec(trimmed);
      if (eqBoolMatch?.[1] && eqBoolMatch[2]) {
        const expected = eqBoolMatch[2].toLowerCase() === 'true';
        return row[eqBoolMatch[1]] === expected;
      }

      // Handle = comparison with parameter
      const eqMatch = /(\w+)\s*=\s*\$(\d+)/i.exec(trimmed);
      if (eqMatch?.[1] && eqMatch[2]) {
        const paramIdx = parseInt(eqMatch[2], 10) - 1;
        const paramVal = params[paramIdx];
        return row[eqMatch[1]] === paramVal;
      }

      // Handle <= comparison
      const lteMatch = /(\w+)\s*<=\s*\$(\d+)/i.exec(trimmed);
      if (lteMatch?.[1] && lteMatch[2]) {
        const paramIdx = parseInt(lteMatch[2], 10) - 1;
        const paramVal = params[paramIdx];
        return String(row[lteMatch[1]]) <= String(paramVal);
      }

      // Handle > comparison
      const gtMatch = /(\w+)\s*>\s*\$(\d+)/i.exec(trimmed);
      if (gtMatch?.[1] && gtMatch[2]) {
        const paramIdx = parseInt(gtMatch[2], 10) - 1;
        const paramVal = params[paramIdx];
        const rowVal = row[gtMatch[1]];
        // null values are not greater than anything
        if (rowVal === null || rowVal === undefined) return false;
        return String(rowVal) > String(paramVal);
      }

      return true;
    });
  }

  async function query<T extends Row = Row>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    const normalized = sql.trim();
    const tableName = parseTableName(normalized);

    // ── INSERT ──
    if (/^INSERT/i.test(normalized)) {
      const colMatch = /\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i.exec(normalized);
      if (colMatch?.[1] && colMatch[2]) {
        const columns = colMatch[1].split(',').map((c) => c.trim());
        const row: Row = {};
        columns.forEach((col, i) => {
          row[col] = params[i];
        });
        getTable(tableName).push(row);
        return { rows: [row as T], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // ── UPDATE ──
    if (/^UPDATE/i.test(normalized)) {
      const setMatch = /SET\s+(.+?)\s+WHERE\s+(.+)/i.exec(normalized);
      if (setMatch?.[1] && setMatch[2]) {
        const table = getTable(tableName);
        const whereClause = setMatch[2];

        // Parse SET assignments
        const assignments = setMatch[1].split(',').map((a) => a.trim());
        const updates: Record<string, unknown> = {};
        for (const assignment of assignments) {
          const parts = /(\w+)\s*=\s*\$(\d+)/i.exec(assignment);
          if (parts?.[1] && parts[2]) {
            const paramIdx = parseInt(parts[2], 10) - 1;
            updates[parts[1]] = params[paramIdx];
          } else {
            const boolParts = /(\w+)\s*=\s*(true|false)/i.exec(assignment);
            if (boolParts?.[1] && boolParts[2]) {
              updates[boolParts[1]] = boolParts[2].toLowerCase() === 'true';
            }
          }
        }

        let rowCount = 0;
        for (const row of table) {
          if (evaluateWhere(row, whereClause, params)) {
            Object.assign(row, updates);
            rowCount++;
          }
        }
        return { rows: [] as T[], rowCount };
      }
      return { rows: [], rowCount: 0 };
    }

    // ── SELECT ──
    if (/^SELECT/i.test(normalized)) {
      const table = getTable(tableName);
      const whereMatch = /WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i.exec(normalized);
      const whereClause = whereMatch?.[1] ?? '';

      let rows = table.filter((row) => evaluateWhere(row, whereClause, params));

      // Handle ORDER BY
      const orderMatch = /ORDER\s+BY\s+(\w+)\s+(ASC|DESC)/i.exec(normalized);
      if (orderMatch?.[1]) {
        const col = orderMatch[1];
        const dir = orderMatch[2]?.toUpperCase() === 'DESC' ? -1 : 1;
        rows = [...rows].sort((a, b) => {
          const aVal = String(a[col] ?? '');
          const bVal = String(b[col] ?? '');
          return aVal.localeCompare(bVal) * dir;
        });
      }

      // Handle LIMIT
      const limitMatch = /LIMIT\s+(\d+)/i.exec(normalized);
      if (limitMatch?.[1]) {
        rows = rows.slice(0, parseInt(limitMatch[1], 10));
      }

      return { rows: rows as T[], rowCount: rows.length };
    }

    return { rows: [], rowCount: 0 };
  }

  return {
    query,
    get _store() {
      return store;
    },
    _reset() {
      store.clear();
    },
  };
}
