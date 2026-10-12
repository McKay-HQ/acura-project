// Totals for the page header, computed in the database.
import { query } from '../db.js';

const lo = 'COALESCE(value_low, value_high)';
const hi = 'COALESCE(value_high, value_low)';

export async function getSummary() {
  const { rows } = await query(`
    SELECT
      (SELECT count(*)::int FROM parts) AS parts,
      (SELECT count(*)::int FROM parts WHERE status = 'Verified') AS verified,
      (SELECT count(*)::int FROM parts WHERE status = 'Unverified') AS unverified,
      (SELECT count(*)::int FROM parts WHERE status = 'Unknown') AS unknown,
      (SELECT COALESCE(sum(${lo}), 0) FROM parts) AS value_low,
      (SELECT COALESCE(sum(${hi}), 0) FROM parts) AS value_high,
      (SELECT count(*)::int FROM parts WHERE 'For sale' = ANY(tags)) AS for_sale,
      (SELECT COALESCE(sum(${lo}), 0) FROM parts WHERE 'For sale' = ANY(tags)) AS sale_low,
      (SELECT COALESCE(sum(${hi}), 0) FROM parts WHERE 'For sale' = ANY(tags)) AS sale_high,
      (SELECT count(*)::int FROM containers WHERE parent_id IS NULL) AS containers,
      (SELECT count(*)::int FROM tossed) AS tossed,
      (SELECT count(*)::int FROM tasks WHERE NOT done) AS tasks_open,
      (SELECT count(*)::int FROM tasks) AS tasks_total`);
  const r = rows[0];
  return {
    parts: { total: r.parts, verified: r.verified, unverified: r.unverified, unknown: r.unknown },
    value: { low: Number(r.value_low), high: Number(r.value_high) },
    forSale: { count: r.for_sale, low: Number(r.sale_low), high: Number(r.sale_high) },
    containers: r.containers,
    tossed: r.tossed,
    tasks: { open: r.tasks_open, total: r.tasks_total },
  };
}
