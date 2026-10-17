// Totals for the page header, computed in the database.
import { query } from '../db.js';
import type { Summary, SummaryRow } from '../types.js';

const lo = 'COALESCE(value_low, value_high)';
const hi = 'COALESCE(value_high, value_low)';
// Deleted records (tombstones) are not counted.
const live = 'deleted_at IS NULL';

export async function getSummary(): Promise<Summary> {
    const { rows } = await query<SummaryRow>(`
    SELECT
      (SELECT count(*)::int FROM parts WHERE ${live}) AS parts,
      (SELECT count(*)::int FROM parts WHERE ${live} AND status = 'Verified') AS verified,
      (SELECT count(*)::int FROM parts WHERE ${live} AND status = 'Unverified') AS unverified,
      (SELECT count(*)::int FROM parts WHERE ${live} AND status = 'Unknown') AS unknown,
      (SELECT COALESCE(sum(${lo}), 0) FROM parts WHERE ${live}) AS value_low,
      (SELECT COALESCE(sum(${hi}), 0) FROM parts WHERE ${live}) AS value_high,
      (SELECT count(*)::int FROM parts WHERE ${live} AND 'For sale' = ANY(tags)) AS for_sale,
      (SELECT COALESCE(sum(${lo}), 0) FROM parts WHERE ${live} AND 'For sale' = ANY(tags)) AS sale_low,
      (SELECT COALESCE(sum(${hi}), 0) FROM parts WHERE ${live} AND 'For sale' = ANY(tags)) AS sale_high,
      (SELECT count(*)::int FROM containers WHERE ${live} AND parent_id IS NULL) AS containers,
      (SELECT count(*)::int FROM tossed WHERE ${live}) AS tossed,
      (SELECT count(*)::int FROM tasks WHERE ${live} AND NOT done) AS tasks_open,
      (SELECT count(*)::int FROM tasks WHERE ${live}) AS tasks_total`);
    const totals = rows[0];
    return {
        parts: {
            total: totals.parts,
            verified: totals.verified,
            unverified: totals.unverified,
            unknown: totals.unknown,
        },
        value: { low: Number(totals.value_low), high: Number(totals.value_high) },
        forSale: { count: totals.for_sale, low: Number(totals.sale_low), high: Number(totals.sale_high) },
        containers: totals.containers,
        tossed: totals.tossed,
        tasks: { open: totals.tasks_open, total: totals.tasks_total },
    };
}
