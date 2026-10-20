// Expenses: purchases and costs for the project, each with a price; unpaid ones are still to pay.
import type { PoolClient } from 'pg';
import { query, runner, tx } from '../db.js';
import type { IfMatch } from '../lib/preconditions.js';
import { resolveId, friendlyDbError, assignments, lockRef, softDelete, versionOf, uniqueKey } from './common.js';
import type { ColumnMap } from './common.js';
import type { Expense, ExpenseInput, ExpenseRow } from '../types.js';

const COLS: ColumnMap<ExpenseInput> = {
    key: 'key',
    label: 'label',
    vendor: 'vendor',
    price: 'price',
    paid: 'paid',
    paidOn: 'paid_on',
    notes: 'notes',
};
const toApi = (row: ExpenseRow): Expense => ({
    id: row.id,
    key: row.key,
    label: row.label,
    vendor: row.vendor,
    price: row.price,
    paid: row.paid,
    paidOn: row.paid_on,
    notes: row.notes,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
});

/** Expenses: unpaid ones first, then newest paid first; deleted ones (tombstones) are left out. */
export async function listExpenses(): Promise<Expense[]> {
    const { rows } = await query<ExpenseRow>(
        `SELECT * FROM expenses WHERE deleted_at IS NULL ORDER BY paid, paid_on DESC NULLS LAST, created_at DESC, id`,
    );
    return rows.map(toApi);
}

export async function getExpense(ref: string, client?: PoolClient): Promise<Expense> {
    const id = await resolveId('expenses', ref, client);
    const { rows } = await runner(client)<ExpenseRow>('SELECT * FROM expenses WHERE id = $1', [id]);
    return toApi(rows[0]);
}

export async function createExpense(data: ExpenseInput): Promise<Expense> {
    try {
        return await tx(async (client) => {
            if (data.key == null) data.key = await uniqueKey(client, 'expenses', data.label ?? '', 'expense');
            // Object.keys widens the keys to string; they are exactly the keys of ExpenseInput.
            const cols = (Object.keys(COLS) as (keyof ExpenseInput)[]).filter((field) => data[field] !== undefined);
            const { rows } = await client.query<ExpenseRow>(
                `INSERT INTO expenses (${cols.map((field) => COLS[field]).join(', ')}) VALUES (${cols.map((_field, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
                cols.map((field) => data[field]),
            );
            return toApi(rows[0]);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

export async function updateExpense(ref: string, data: ExpenseInput, im: IfMatch): Promise<Expense> {
    try {
        return await tx(async (client) => {
            const id = await lockRef(client, 'expenses', ref, im, getExpense);
            const { sets, vals } = assignments(data, COLS, 2);
            if (sets.length)
                await client.query(`UPDATE expenses SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [
                    id,
                    ...vals,
                ]);
            return getExpense(id, client);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

/** Soft-delete an expense. Returns the new version. */
export async function deleteExpense(ref: string, im: IfMatch): Promise<number> {
    return tx(async (client) => {
        const id = await lockRef(client, 'expenses', ref, im, getExpense);
        await softDelete(client, 'expenses', id);
        return versionOf(client, 'expenses', id);
    });
}
