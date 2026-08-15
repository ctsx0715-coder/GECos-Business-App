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
import { createEmployeeAction } from "../../actions";

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

export function EmployeeForm({
  managers,
  users,
}: {
  managers: Choice[];
  users: Choice[];
}) {
  const router = useRouter();
  const { pending, message, fieldErrors, submit } = useFormAction();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [managerId, setManagerId] = useState("");
  const [userId, setUserId] = useState("");
  const [employmentType, setEmploymentType] = useState("PERMANENT");
  const [startedAt, setStartedAt] = useState("");

  return (
    <Card>
      <CardHeader
        icon="users"
        title="Employee"
        description="A login is optional — most site staff will never have one"
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
          hint="Not validated as an SA ID — foreign nationals carry passports and permits."
        />
        <TextField
          label="Start date"
          name="startedAt"
          type="date"
          value={startedAt}
          onChange={setStartedAt}
          errors={fieldErrors}
          required
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
        submitLabel="Add employee"
        onCancel={() => router.push("/hr/employees")}
        onSubmit={() =>
          submit(() =>
            createEmployeeAction({
              firstName,
              lastName,
              email: email || undefined,
              phone: phone || undefined,
              nationalId: nationalId || undefined,
              jobTitle: jobTitle || undefined,
              department: department || undefined,
              managerId: managerId || undefined,
              userId: userId || undefined,
              employmentType,
              startedAt: startedAt || undefined,
            }),
          )
        }
      />
    </Card>
  );
}
