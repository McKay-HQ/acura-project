// Expenses: what the project has cost and what's still to pay, each with a price, plus the totals.
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { api, errorMessage, PreconditionFailedError } from '../api';
import { useEditFields, clashText, CONFLICT_IN_FORM } from './forms';
import { RowActions, AddButton, FormButtons } from './ui';
import { Icon } from './Icons';
import { money, fmtDate } from '../constants';
import type { Expense, ExpenseInput } from '../types';

type SortDir = 'asc' | 'desc';
/** Sort key for the Paid column: the paid date, with not paid after every date ('~' sorts after any digit). */
const paidKey = (expense: Expense): string => (expense.paid ? expense.paidOn || '' : '~');
const cmp = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
/** By the Paid column, ties (e.g. several not paid) by id, both in the chosen direction. */
const byPaid =
    (dir: SortDir) =>
    (left: Expense, right: Expense): number =>
        (cmp(paidKey(left), paidKey(right)) || cmp(left.id, right.id)) * (dir === 'asc' ? 1 : -1);

const sum = (list: Expense[]): number => list.reduce((total, expense) => total + Number(expense.price), 0);
/** Dollars and cents, e.g. $1,234.50. */
const dollars = (amount: number): string =>
    `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface ExpensesViewProps {
    expenses: Expense[];
    canEdit: boolean;
    onAdd: () => void;
    onEdit: (expense: Expense) => void;
    onDelete: (expense: Expense) => void;
}

export function ExpensesView({ expenses, canEdit, onAdd, onEdit, onDelete }: ExpensesViewProps) {
    const spent = sum(expenses.filter((expense) => expense.paid));
    const toPay = sum(expenses.filter((expense) => !expense.paid));
    const [dir, setDir] = useState<SortDir>('desc');
    const sorted = [...expenses].sort(byPaid(dir));
    const sortButton = (to: SortDir, label: string, icon: JSX.Element) => (
        <button
            type="button"
            className="sortbtn"
            aria-pressed={dir === to}
            title={label}
            aria-label={label}
            onClick={() => setDir(to)}
        >
            {icon}
        </button>
    );
    return (
        <section className="view" style={{ display: 'grid', gap: 20 }}>
            <div className="bar">
                <span className="mini">Purchases and costs for the project. Unpaid ones are still to pay.</span>
                <span className="spacer" />
                {canEdit && <AddButton label="Add expense" onClick={onAdd} />}
            </div>
            <div className="stats">
                <div className="stat">
                    <span>Spent</span>
                    <b>{dollars(spent)}</b>
                </div>
                <div className="stat">
                    <span>Still to pay</span>
                    <b>{dollars(toPay)}</b>
                </div>
                <div className="stat">
                    <span>Total</span>
                    <b>{dollars(spent + toPay)}</b>
                </div>
            </div>
            {!expenses.length ? (
                <div className="empty">No expenses yet.</div>
            ) : (
                <div className="tblwrap">
                    <table className="tbl">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th aria-sort={dir === 'asc' ? 'ascending' : 'descending'}>
                                    <span className="sorth">
                                        Paid
                                        {sortButton('asc', 'Oldest first, not paid last', <Icon.up />)}
                                        {sortButton('desc', 'Not paid first, then newest', <Icon.down />)}
                                    </span>
                                </th>
                                <th className="num">Price</th>
                                {canEdit && (
                                    <th>
                                        <span className="sr">Actions</span>
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((expense) => (
                                <tr key={expense.id}>
                                    <td className="lbl">
                                        <div>{expense.label}</div>
                                        {expense.vendor && <div className="vendor">{expense.vendor}</div>}
                                        {expense.notes && <div className="nt">{expense.notes}</div>}
                                    </td>
                                    <td className="nowrap">
                                        {expense.paid ? (
                                            <span className="pill tdate">{fmtDate(expense.paidOn) || 'Paid'}</span>
                                        ) : (
                                            <span className="pill s-unv">Not paid</span>
                                        )}
                                    </td>
                                    <td className="num">{money(expense.price)}</td>
                                    {canEdit && (
                                        <td>
                                            <RowActions
                                                inTable
                                                onEdit={() => onEdit(expense)}
                                                onDelete={() => onDelete(expense)}
                                                deleteLabel="Delete expense"
                                                confirmText="Delete?"
                                            />
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={2}>
                                    {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}
                                </td>
                                <td className="num">{dollars(spent + toPay)}</td>
                                {canEdit && <td />}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </section>
    );
}

interface ExpenseFormProps {
    expense?: Expense;
    onSaved: (expense: Expense) => void;
    onCancel: () => void;
}
interface ExpenseFields {
    label: string;
    vendor: string;
    /** A number from the record, or the input's string once edited. */
    price: number | string;
    paid: boolean;
    paidOn: string;
    notes: string;
}

const expenseFields = (expense?: Expense): ExpenseFields => ({
    label: expense?.label || '',
    vendor: expense?.vendor || '',
    price: expense?.price ?? '',
    paid: expense?.paid ?? true,
    paidOn: expense?.paidOn || '',
    notes: expense?.notes || '',
});
const expenseInput = (fields: ExpenseFields): ExpenseInput => ({
    label: fields.label,
    vendor: fields.vendor,
    price: fields.price === '' ? null : Number(fields.price),
    paid: fields.paid,
    // A date only goes with a paid expense.
    paidOn: (fields.paid && fields.paidOn) || null,
    notes: fields.notes,
});
const EXPENSE_LABELS: Record<keyof ExpenseFields, string> = {
    label: 'Item',
    vendor: 'Vendor',
    price: 'Price',
    paid: 'Paid',
    paidOn: 'Date paid',
    notes: 'Notes',
};

export function ExpenseForm({ expense, onSaved, onCancel }: ExpenseFormProps) {
    const edit = useEditFields(expenseFields(expense), expenseInput, EXPENSE_LABELS);
    const { f, setF } = edit;
    // The expense as of this form's last write; its version goes with the save (not refreshed from the list).
    const [rec, setRec] = useState<Expense | undefined>(expense);
    const [busy, setBusy] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const set =
        (key: Exclude<keyof ExpenseFields, 'paid'>) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setF({ ...f, [key]: event.target.value });

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            if (rec) {
                // Only the fields the user changed, so other people's changes to the rest survive.
                const body = edit.changes();
                onSaved(Object.keys(body).length ? await api.expenses.update(rec, body) : rec);
            } else {
                onSaved(await api.expenses.create(edit.input()));
            }
        } catch (err) {
            if (err instanceof PreconditionFailedError && rec) {
                // Keep the typed values; take the current values for untouched fields and its version.
                const current = err.currentFor(rec);
                let clashes = '';
                if (current) {
                    setRec(current);
                    clashes = clashText(edit.rebase(expenseFields(current)));
                }
                setError(CONFLICT_IN_FORM + clashes);
            } else {
                setError(errorMessage(err));
            }
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit}>
            <h3 id="form-title">{expense ? 'Edit expense' : 'Add expense'}</h3>
            <label>
                Item
                <input
                    value={f.label}
                    onChange={set('label')}
                    required
                    maxLength={200}
                    placeholder="e.g. Injen air filter"
                    autoFocus
                />
            </label>
            <label>
                Vendor
                <input value={f.vendor} onChange={set('vendor')} maxLength={200} placeholder="Store or who was paid" />
            </label>
            <label>
                Price ($)
                <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    value={f.price}
                    onChange={set('price')}
                    required
                />
            </label>
            <label className="check">
                <input
                    type="checkbox"
                    checked={f.paid}
                    onChange={(event) => setF({ ...f, paid: event.target.checked })}
                />
                Paid
            </label>
            {f.paid && (
                <label>
                    Date paid
                    <input type="date" value={f.paidOn} onChange={set('paidOn')} />
                </label>
            )}
            <label>
                Notes
                <textarea rows={3} value={f.notes} onChange={set('notes')} />
            </label>
            {error && (
                <p className="err" role="alert">
                    {error}
                </p>
            )}
            <FormButtons onCancel={onCancel} busy={busy} />
        </form>
    );
}
