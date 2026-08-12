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
import {
  createProjectAction,
  createProjectFromTenderAction,
  type Choice,
} from "../../create-actions";

/**
 * New project, two ways.
 *
 * Starting from a won tender is offered first and is the default when any are
 * available, because it is both less typing and the path that keeps the
 * customer, the awarded value and the link back to the bid intact. Creating
 * one from scratch is the fallback for work that never went to tender.
 */
export function ProjectForm({
  customers,
  users,
  wonTenders,
}: {
  customers: Choice[];
  users: Choice[];
  wonTenders: Choice[];
}) {
  const router = useRouter();
  const { pending, message, fieldErrors, submit } = useFormAction();

  const [mode, setMode] = useState<"tender" | "blank">(
    wonTenders.length > 0 ? "tender" : "blank",
  );

  const [tenderId, setTenderId] = useState("");
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [budget, setBudget] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Card>
      <CardHeader
        title="Project details"
        description={
          mode === "tender"
            ? "Customer, contract value and the link to the bid all carry across"
            : "For work that did not come through a tender"
        }
      />

      <div className="flex flex-wrap gap-4 border-b border-border px-5 py-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={mode === "tender"}
            disabled={wonTenders.length === 0}
            onChange={() => setMode("tender")}
            className="accent-[var(--accent)]"
          />
          From a won tender
          {wonTenders.length === 0 && (
            <span className="text-xs text-muted">(none available)</span>
          )}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={mode === "blank"}
            onChange={() => setMode("blank")}
            className="accent-[var(--accent)]"
          />
          From scratch
        </label>
      </div>

      <FormGrid>
        {mode === "tender" ? (
          <FullWidth>
            <SelectField
              label="Won tender"
              name="tenderId"
              required
              value={tenderId}
              onChange={setTenderId}
              options={wonTenders}
              errors={fieldErrors}
              placeholder="Choose a won tender…"
              hint="Only won tenders without a project already appear here."
            />
          </FullWidth>
        ) : (
          <>
            <FullWidth>
              <TextField
                label="Project name"
                name="name"
                required
                value={name}
                onChange={setName}
                errors={fieldErrors}
                placeholder="Reservoir refurbishment"
              />
            </FullWidth>
            <SelectField
              label="Client"
              name="customerId"
              required
              value={customerId}
              onChange={setCustomerId}
              options={customers}
              errors={fieldErrors}
            />
            <MoneyField
              label="Contract value"
              name="contractValueRands"
              value={contractValue}
              onChange={setContractValue}
              errors={fieldErrors}
              hint="What the client pays"
            />
          </>
        )}

        {mode === "tender" && (
          <TextField
            label="Project name"
            name="name"
            value={name}
            onChange={setName}
            errors={fieldErrors}
            placeholder="Defaults to the tender title"
          />
        )}

        <SelectField
          label="Project manager"
          name="managerId"
          value={managerId}
          onChange={setManagerId}
          options={users}
          errors={fieldErrors}
          placeholder="Defaults to you"
        />

        <MoneyField
          label="Budget"
          name="budgetRands"
          value={budget}
          onChange={setBudget}
          errors={fieldErrors}
          hint="What you allow yourself to spend"
        />

        <TextField
          label="Start date"
          name="startsAt"
          type="date"
          value={startsAt}
          onChange={setStartsAt}
          errors={fieldErrors}
        />
        <TextField
          label="End date"
          name="endsAt"
          type="date"
          value={endsAt}
          onChange={setEndsAt}
          errors={fieldErrors}
        />

        {mode === "blank" && (
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
        )}

        <FullWidth>
          <FormMessage message={message} />
        </FullWidth>
      </FormGrid>

      <FormActions
        pending={pending}
        submitLabel={mode === "tender" ? "Start project" : "Create project"}
        onCancel={() => router.push("/projects")}
        onSubmit={() =>
          submit(() =>
            mode === "tender"
              ? createProjectFromTenderAction({
                  tenderId: tenderId || undefined,
                  name: name || undefined,
                  managerId: managerId || undefined,
                  budgetRands: budget ? Number(budget) : undefined,
                  startsAt: startsAt || undefined,
                  endsAt: endsAt || undefined,
                })
              : createProjectAction({
                  name,
                  customerId: customerId || undefined,
                  managerId: managerId || undefined,
                  contractValueRands: contractValue
                    ? Number(contractValue)
                    : undefined,
                  budgetRands: budget ? Number(budget) : undefined,
                  startsAt: startsAt || undefined,
                  endsAt: endsAt || undefined,
                  description: description || undefined,
                }),
          )
        }
      />
    </Card>
  );
}
