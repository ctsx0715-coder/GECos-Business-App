"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui";
import {
  FormActions,
  FormGrid,
  FormMessage,
  FullWidth,
  SelectField,
  TextField,
  useFormAction,
} from "@/components/forms";
import { EXPENSE_CATEGORY_LABELS } from "@/modules/procurement/vocabulary";
import { createStockItemAction } from "../../actions";

/**
 * Putting something on the stock register.
 *
 * The two reorder fields are the only ones here that do any work later, and
 * both are deliberately optional. An item with no level set never appears on a
 * buyer's list — which is right for the things you order against a job rather
 * than hold — and defaulting them to zero would turn every one of those into
 * a false alarm the first time a store emptied.
 */

const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/** The units a contractor's store actually uses, plus whatever they type. */
const UNITS = [
  "each",
  "bag",
  "m",
  "m²",
  "m³",
  "kg",
  "tonne",
  "l",
  "roll",
  "length",
  "set",
].map((unit) => ({ value: unit, label: unit }));

export function StockItemForm() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("each");
  const [category, setCategory] = useState("MATERIALS");
  const [reorderLevel, setReorderLevel] = useState("");
  const [reorderQuantity, setReorderQuantity] = useState("");
  const [notes, setNotes] = useState("");

  const router = useRouter();
  const { pending, message, fieldErrors, submit } = useFormAction();

  return (
    <Card>
      <CardHeader
        title="The item"
        description="Something you count. Plant hire and labour do not belong here"
      />
      <FormGrid>
        <FullWidth>
          <TextField
            label="Name"
            name="name"
            value={name}
            onChange={setName}
            errors={fieldErrors}
            required
            placeholder="Cement 42.5N 50kg"
          />
        </FullWidth>
        <TextField
          label="Your code"
          name="code"
          value={code}
          onChange={setCode}
          errors={fieldErrors}
          hint="As painted on the rack, if you have one"
        />
        <SelectField
          label="Counted in"
          name="unit"
          value={unit}
          onChange={setUnit}
          options={UNITS}
          errors={fieldErrors}
          placeholder="each"
        />
        <SelectField
          label="Category"
          name="category"
          value={category}
          onChange={setCategory}
          options={CATEGORIES}
          errors={fieldErrors}
          placeholder="Materials"
        />
        <TextField
          label="Reorder level"
          name="reorderLevel"
          type="number"
          value={reorderLevel}
          onChange={setReorderLevel}
          errors={fieldErrors}
          hint="Leave empty for something you only buy against a job"
        />
        <TextField
          label="Reorder quantity"
          name="reorderQuantity"
          type="number"
          value={reorderQuantity}
          onChange={setReorderQuantity}
          errors={fieldErrors}
          hint="How much to buy when it does run low"
        />
        <FullWidth>
          <TextField
            label="Description"
            name="description"
            value={description}
            onChange={setDescription}
            errors={fieldErrors}
            multiline
          />
        </FullWidth>
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

      <FormMessage message={message} />

      <FormActions
        pending={pending}
        submitLabel="Add to the register"
        onCancel={() => router.push("/inventory/items")}
        onSubmit={() =>
          submit(() =>
            createStockItemAction({
              name,
              code: code || undefined,
              description: description || undefined,
              unit,
              category,
              // Empty is "nobody has said", which is not the same as zero.
              reorderLevel: reorderLevel === "" ? null : Number(reorderLevel),
              reorderQuantity:
                reorderQuantity === "" ? null : Number(reorderQuantity),
              notes: notes || undefined,
            }),
          )
        }
      />
    </Card>
  );
}
