"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCentsExact } from "@/lib/format";
import { EXPENSE_CATEGORY_LABELS } from "@/modules/procurement/vocabulary";
import { Card, CardHeader, Icon } from "@/components/ui";
import {
  FormActions,
  FormGrid,
  FormMessage,
  FullWidth,
  SelectField,
  TextField,
  useFormAction,
} from "@/components/forms";
import { createOrderAction } from "../../actions";

/**
 * The order and its lines, on one screen.
 *
 * Lines are added in place rather than one at a time against a saved order,
 * because a purchase order is a single thought — "we need this, this and this
 * from Afrimat" — and saving after each line makes a buyer type a page in four
 * round trips. The running total is shown as it is typed, since the number
 * that decides whether this needs an approver is the one at the bottom.
 */

interface Option {
  value: string;
  label: string;
}

interface Line {
  key: string;
  description: string;
  unit: string;
  quantity: string;
  unitPriceRands: string;
  category: string;
}

const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS).map(
  ([value, label]) => ({ value, label }),
);

function emptyLine(): Line {
  return {
    key: crypto.randomUUID(),
    description: "",
    unit: "each",
    quantity: "",
    unitPriceRands: "",
    category: "MATERIALS",
  };
}

/** Cents, rounded the same way the service does, so the totals agree. */
function lineCents(line: Line): number {
  const quantity = Number(line.quantity) || 0;
  const price = Number(line.unitPriceRands) || 0;
  return Math.round(quantity * Math.round(price * 100));
}

const cellClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

export function OrderForm({
  suppliers,
  projects,
}: {
  suppliers: Option[];
  projects: Option[];
}) {
  const [supplierId, setSupplierId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [deliverTo, setDeliverTo] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const router = useRouter();
  const { pending, message, fieldErrors, submit } = useFormAction();

  const set = (key: string, field: keyof Line, value: string) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, [field]: value } : line)),
    );

  const filled = lines.filter(
    (line) => line.description.trim() && Number(line.quantity) > 0,
  );
  const total = filled.reduce((sum, line) => sum + lineCents(line), 0);

  return (
    <>
      <Card>
        <CardHeader
          title="The order"
          description="Who it is with, and where it has to go"
        />
        <FormGrid>
          <SelectField
            label="Supplier"
            name="supplierId"
            value={supplierId}
            onChange={setSupplierId}
            options={suppliers}
            errors={fieldErrors}
            required
            hint="Only suppliers that have been cleared"
          />
          <SelectField
            label="Site"
            name="projectId"
            value={projectId}
            onChange={setProjectId}
            options={projects}
            errors={fieldErrors}
            placeholder="No site — yard or office"
            hint="Counts against that project's budget once approved"
          />
          <TextField
            label="Needed by"
            name="requiredBy"
            type="date"
            value={requiredBy}
            onChange={setRequiredBy}
            errors={fieldErrors}
          />
          <TextField
            label="Deliver to"
            name="deliverTo"
            value={deliverTo}
            onChange={setDeliverTo}
            errors={fieldErrors}
            placeholder="Gate 2, Church Street entrance"
            hint="Read by a driver looking for a gate"
          />
          <FullWidth>
            <TextField
              label="Notes"
              name="notes"
              value={notes}
              onChange={setNotes}
              errors={fieldErrors}
              multiline
            />
          </FullWidth>
        </FormGrid>
      </Card>

      <Card>
        <CardHeader
          title="What is being bought"
          description="Quantities go to three decimal places — 12.5 m³ is an ordinary order"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-faint">
                <th className="px-5 py-2.5 font-medium">Description</th>
                <th className="w-24 px-2 py-2.5 font-medium">Quantity</th>
                <th className="w-24 px-2 py-2.5 font-medium">Unit</th>
                <th className="w-32 px-2 py-2.5 font-medium">Price each</th>
                <th className="w-36 px-2 py-2.5 font-medium">Category</th>
                <th className="w-32 px-5 py-2.5 text-right font-medium">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((line) => (
                <tr key={line.key}>
                  <td className="px-5 py-2">
                    <input
                      value={line.description}
                      onChange={(event) =>
                        set(line.key, "description", event.target.value)
                      }
                      placeholder="Ready-mix 25MPa"
                      className={cellClass}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) =>
                        set(
                          line.key,
                          "quantity",
                          event.target.value.replace(/[^\d.]/g, ""),
                        )
                      }
                      className={cellClass}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={line.unit}
                      onChange={(event) => set(line.key, "unit", event.target.value)}
                      className={cellClass}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      inputMode="decimal"
                      value={line.unitPriceRands}
                      onChange={(event) =>
                        set(
                          line.key,
                          "unitPriceRands",
                          event.target.value.replace(/[^\d.]/g, ""),
                        )
                      }
                      className={cellClass}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={line.category}
                      onChange={(event) =>
                        set(line.key, "category", event.target.value)
                      }
                      className={cellClass}
                    >
                      {CATEGORIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums text-muted">
                    {formatCentsExact(lineCents(line))}
                  </td>
                  <td className="pr-3">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        aria-label="Remove this line"
                        onClick={() =>
                          setLines((current) =>
                            current.filter((row) => row.key !== line.key),
                          )
                        }
                        className="rounded p-1 text-faint transition hover:bg-surface-muted hover:text-danger"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={5} className="px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setLines((current) => [...current, emptyLine()])}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                  >
                    <Icon name="plus" size={14} />
                    Another line
                  </button>
                </td>
                <td className="px-5 py-3 text-right tabular-nums font-medium">
                  {formatCentsExact(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <FormMessage message={message} />

        <FormActions
          pending={pending}
          submitLabel="Save the draft"
          disabled={!supplierId || filled.length === 0}
          onCancel={() => router.push("/procurement/orders")}
          onSubmit={() =>
            submit(() =>
              createOrderAction({
                supplierId,
                projectId: projectId || undefined,
                deliverTo: deliverTo || undefined,
                requiredBy: requiredBy || undefined,
                notes: notes || undefined,
                lines: filled.map((line) => ({
                  description: line.description,
                  unit: line.unit || "each",
                  quantity: Number(line.quantity),
                  unitPriceRands: Number(line.unitPriceRands) || 0,
                  category: line.category,
                })),
              }),
            )
          }
        />
      </Card>
    </>
  );
}
