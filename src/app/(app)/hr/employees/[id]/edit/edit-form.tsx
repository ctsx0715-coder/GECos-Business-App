"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { updateEmployeeAction } from "../../../actions";

/**
 * Editing a person.
 *
 * Deliberately not the create form with a flag. Two fields exist only here —
 * status, and the start date, which on the create form is a fact and here is a
 * correction — and the exit route is not here at all: ending employment
 * cancels future leave and starts a retention clock, so it is its own action
 * rather than a status anyone can pick from a list.
 */

interface Choice {
  value: string;
  label: string;
}

const EMPLOYMENT_TYPES: Choice[] = [
  { value: "PERMANENT", label: "Permanent" },
  { value: "FIXED_TERM", label: "Fixed term" },
  { value: "TEMPORARY", label: "Temporary" },
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "APPRENTICE", label: "Apprentice" },
];

/** EXITED is absent on purpose — see the note above. */
const STATUSES: Choice[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_LEAVE", label: "On leave" },
  { value: "SUSPENDED", label: "Suspended" },
];

export interface EditableEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationalId: string;
  jobTitle: string;
  department: string;
  managerId: string;
  userId: string;
  employmentType: string;
  status: string;
  startedAt: string;
  workPatternId: string;
}

export function EditEmployeeForm({
  employee,
  managers,
  users,
  workPatterns,
}: {
  employee: EditableEmployee;
  managers: Choice[];
  users: Choice[];
  workPatterns: Choice[];
}) {
  const router = useRouter();
  const { pending, message, fieldErrors, submit } = useFormAction();

  const [firstName, setFirstName] = useState(employee.firstName);
  const [lastName, setLastName] = useState(employee.lastName);
  const [email, setEmail] = useState(employee.email);
  const [phone, setPhone] = useState(employee.phone);
  const [nationalId, setNationalId] = useState(employee.nationalId);
  const [jobTitle, setJobTitle] = useState(employee.jobTitle);
  const [department, setDepartment] = useState(employee.department);
  const [managerId, setManagerId] = useState(employee.managerId);
  const [userId, setUserId] = useState(employee.userId);
  const [employmentType, setEmploymentType] = useState(employee.employmentType);
  const [status, setStatus] = useState(employee.status);
  const [startedAt, setStartedAt] = useState(employee.startedAt);
  const [workPatternId, setWorkPatternId] = useState(employee.workPatternId);

  const exited = employee.status === "EXITED";

  return (
    <Card>
      <CardHeader
        icon="users"
        title="Record"
        description={
          exited
            ? "This person has left. Their record is kept, and editing it is a correction."
            : "Every change is written to the audit trail with a before and after"
        }
      />

      <FormGrid>
        <TextField
          label="First name"
          name="firstName"
          value={firstName}
          onChange={setFirstName}
          errors={fieldErrors}
          required
        />
        <TextField
          label="Last name"
          name="lastName"
          value={lastName}
          onChange={setLastName}
          errors={fieldErrors}
          required
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          errors={fieldErrors}
        />
        <TextField
          label="Phone"
          name="phone"
          type="tel"
          value={phone}
          onChange={setPhone}
          errors={fieldErrors}
        />
        <TextField
          label="ID or passport number"
          name="nationalId"
          value={nationalId}
          onChange={setNationalId}
          errors={fieldErrors}
        />
        <TextField
          label="Start date"
          name="startedAt"
          type="date"
          value={startedAt}
          onChange={setStartedAt}
          errors={fieldErrors}
          hint="Accrual counts from this date, so a correction here moves balances."
        />
        <TextField
          label="Job title"
          name="jobTitle"
          value={jobTitle}
          onChange={setJobTitle}
          errors={fieldErrors}
        />
        <TextField
          label="Department"
          name="department"
          value={department}
          onChange={setDepartment}
          errors={fieldErrors}
        />
        <SelectField
          label="Contract"
          name="employmentType"
          value={employmentType}
          onChange={setEmploymentType}
          options={EMPLOYMENT_TYPES}
          errors={fieldErrors}
        />
        {!exited && (
          <SelectField
            label="Status"
            name="status"
            value={status}
            onChange={setStatus}
            options={STATUSES}
            errors={fieldErrors}
            hint="Ending employment is done from the record, not from here."
          />
        )}
        <SelectField
          label="Works"
          name="workPatternId"
          value={workPatternId}
          onChange={setWorkPatternId}
          options={workPatterns}
          placeholder="The default pattern"
          errors={fieldErrors}
          hint="Decides what a week of leave costs this person."
        />
        <SelectField
          label="Reports to"
          name="managerId"
          value={managerId}
          onChange={setManagerId}
          options={managers}
          placeholder="Nobody"
          errors={fieldErrors}
        />
        <FullWidth>
          <SelectField
            label="System login"
            name="userId"
            value={userId}
            onChange={setUserId}
            options={users}
            placeholder="No login"
            errors={fieldErrors}
            hint="Links this person to an account so they can request their own leave."
          />
        </FullWidth>
      </FormGrid>

      <FormMessage message={message} />

      <FormActions
        pending={pending}
        submitLabel="Save changes"
        onCancel={() => router.push(`/hr/employees/${employee.id}`)}
        onSubmit={() =>
          submit(() =>
            updateEmployeeAction(employee.id, {
              firstName,
              lastName,
              // An emptied field is a deliberate clearing, not an omission, so
              // it is sent as "" for the service to turn into null.
              email,
              phone: phone || undefined,
              nationalId: nationalId || undefined,
              jobTitle: jobTitle || undefined,
              department: department || undefined,
              managerId: managerId || undefined,
              userId: userId || undefined,
              employmentType,
              // Null puts them back on the default; undefined would leave the
              // pattern they are on untouched, which is not what an emptied
              // select means.
              workPatternId: workPatternId || null,
              status: exited ? undefined : status,
              startedAt: startedAt || undefined,
            }),
          )
        }
      />
    </Card>
  );
}
