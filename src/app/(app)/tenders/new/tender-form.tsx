"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardHeader } from "@/components/ui";
import {
  FormActions,
  FormGrid,
  FormMessage,
  FullWidth,
  MoneyField,
  SelectField,
  TextField,
  useFormAction,
} from "@/components/forms";
import { createTenderAction, type Choice } from "../../create-actions";

/**
 * New tender.
 *
 * The default checklist is seeded by the service on create, so a bid pack
 * starts with its compliance requirements already listed rather than the user
 * having to remember what a tender needs.
 */
export function TenderForm({
  customers,
  users,
}: {
  customers: Choice[];
  users: Choice[];
}) {
  const router = useRouter();
  const { pending, message, fieldErrors, submit } = useFormAction();

  const [title, setTitle] = useState("");
  const [tenderNumber, setTenderNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [closingAt, setClosingAt] = useState("");
  const [value, setValue] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Card>
      <CardHeader
        title="Tender details"
        description="The submission checklist is created automatically"
      />

      <FormGrid>
        <FullWidth>
          <TextField
            label="Title"
            name="title"
            required
            value={title}
            onChange={setTitle}
            errors={fieldErrors}
            placeholder="Bulk water pipeline replacement, Ward 12"
          />
        </FullWidth>

        <SelectField
          label="Client"
          name="customerId"
          value={customerId}
          onChange={setCustomerId}
          options={customers}
          errors={fieldErrors}
          placeholder="Choose a customer…"
          hint="Not listed? Add them under Customers first."
        />

        <TextField
          label="Client's tender number"
          name="tenderNumber"
          value={tenderNumber}
          onChange={setTenderNumber}
          errors={fieldErrors}
          placeholder="As printed on their documents"
        />

        <TextField
          label="Closing date"
          name="closingAt"
          type="date"
          required
          value={closingAt}
          onChange={setClosingAt}
          errors={fieldErrors}
          hint="Must be in the future"
        />

        <MoneyField
          label="Estimated value"
          name="estimatedValueRands"
          value={value}
          onChange={setValue}
          errors={fieldErrors}
        />

        <TextField
          label="Industry"
          name="industry"
          value={industry}
          onChange={setIndustry}
          errors={fieldErrors}
          placeholder="Civil engineering"
        />

        <SelectField
          label="Owner"
          name="ownerId"
          value={ownerId}
          onChange={setOwnerId}
          options={users}
          errors={fieldErrors}
          placeholder="Defaults to you"
        />

        <FullWidth>
          <TextField
            label="Description"
            name="description"
            multiline
            value={description}
            onChange={setDescription}
            errors={fieldErrors}
          />
        </FullWidth>

        <FullWidth>
          <FormMessage message={message} />
        </FullWidth>
      </FormGrid>

      <FormActions
        pending={pending}
        submitLabel="Create tender"
        onCancel={() => router.push("/tenders")}
        onSubmit={() =>
          submit(() =>
            createTenderAction({
              title,
              tenderNumber: tenderNumber || undefined,
              description: description || undefined,
              customerId: customerId || undefined,
              ownerId: ownerId || undefined,
              closingAt: closingAt || undefined,
              estimatedValueRands: value ? Number(value) : undefined,
              industry: industry || undefined,
            }),
          )
        }
      />
    </Card>
  );
}
