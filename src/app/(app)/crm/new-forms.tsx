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
  createCustomerAction,
  createLeadAction,
  createOpportunityAction,
  type Choice,
} from "../create-actions";

const LEAD_SOURCES = [
  { value: "REFERRAL", label: "Referral" },
  { value: "WEBSITE", label: "Website" },
  { value: "TENDER_PORTAL", label: "Tender portal" },
  { value: "COLD_OUTREACH", label: "Cold outreach" },
  { value: "EXISTING_CLIENT", label: "Existing client" },
  { value: "EVENT", label: "Event" },
  { value: "OTHER", label: "Other" },
];

export function CustomerForm() {
  const router = useRouter();
  const { pending, message, fieldErrors, submit } = useFormAction();

  const [name, setName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [isPublicSector, setIsPublicSector] = useState(false);

  return (
    <Card>
      <CardHeader
        title="Customer details"
        description="One record, used by tenders, deals and projects alike"
      />
      <FormGrid>
        <FullWidth>
          <TextField
            label="Name"
            name="name"
            required
            value={name}
            onChange={setName}
            errors={fieldErrors}
            placeholder="City of Tshwane"
            hint="Creating a duplicate of an existing name is refused."
          />
        </FullWidth>

        <TextField
          label="Registration number"
          name="registrationNumber"
          value={registrationNumber}
          onChange={setRegistrationNumber}
          errors={fieldErrors}
        />
        <TextField
          label="VAT number"
          name="vatNumber"
          value={vatNumber}
          onChange={setVatNumber}
          errors={fieldErrors}
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
          label="City"
          name="city"
          value={city}
          onChange={setCity}
          errors={fieldErrors}
        />
        <TextField
          label="Province"
          name="province"
          value={province}
          onChange={setProvince}
          errors={fieldErrors}
        />

        <FullWidth>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublicSector}
              onChange={(event) => setIsPublicSector(event.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Organ of state
            <span className="text-xs text-muted">
              — carries extra tender compliance obligations
            </span>
          </label>
        </FullWidth>

        <FullWidth>
          <FormMessage message={message} />
        </FullWidth>
      </FormGrid>

      <FormActions
        pending={pending}
        submitLabel="Create customer"
        onCancel={() => router.push("/crm/customers")}
        onSubmit={() =>
          submit(() =>
            createCustomerAction({
              name,
              registrationNumber: registrationNumber || undefined,
              vatNumber: vatNumber || undefined,
              email: email || undefined,
              phone: phone || undefined,
              city: city || undefined,
              province: province || undefined,
              isPublicSector,
            }),
          )
        }
      />
    </Card>
  );
}

export function LeadForm({ users }: { users: Choice[] }) {
  const router = useRouter();
  const { pending, message, fieldErrors, submit } = useFormAction();

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("OTHER");
  const [value, setValue] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Card>
      <CardHeader
        title="Enquiry details"
        description="Leads sit outside the pipeline until they are qualified"
      />
      <FormGrid>
        <TextField
          label="Company"
          name="companyName"
          required
          value={companyName}
          onChange={setCompanyName}
          errors={fieldErrors}
          placeholder="Rand Water"
        />
        <TextField
          label="Contact name"
          name="contactName"
          value={contactName}
          onChange={setContactName}
          errors={fieldErrors}
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
        <SelectField
          label="Source"
          name="source"
          value={source}
          onChange={setSource}
          options={LEAD_SOURCES}
          errors={fieldErrors}
          placeholder="Where did it come from?"
        />
        <MoneyField
          label="Estimated value"
          name="estimatedValueRands"
          value={value}
          onChange={setValue}
          errors={fieldErrors}
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
            label="What do they want?"
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
        submitLabel="Add lead"
        onCancel={() => router.push("/crm/leads")}
        onSubmit={() =>
          submit(() =>
            createLeadAction({
              companyName,
              contactName: contactName || undefined,
              email: email || undefined,
              phone: phone || undefined,
              source: source || "OTHER",
              estimatedValueRands: value ? Number(value) : undefined,
              ownerId: ownerId || undefined,
              description: description || undefined,
            }),
          )
        }
      />
    </Card>
  );
}

export function OpportunityForm({
  customers,
  users,
  tenders,
}: {
  customers: Choice[];
  users: Choice[];
  tenders: Choice[];
}) {
  const router = useRouter();
  const { pending, message, fieldErrors, submit } = useFormAction();

  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [value, setValue] = useState("");
  const [probability, setProbability] = useState("25");
  const [expectedCloseAt, setExpectedCloseAt] = useState("");
  const [tenderId, setTenderId] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Card>
      <CardHeader
        title="Deal details"
        description="Opportunities enter the pipeline at Qualified"
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
            placeholder="Framework agreement — bulk water"
          />
        </FullWidth>

        <SelectField
          label="Customer"
          name="customerId"
          required
          value={customerId}
          onChange={setCustomerId}
          options={customers}
          errors={fieldErrors}
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
        <MoneyField
          label="Value"
          name="valueRands"
          value={value}
          onChange={setValue}
          errors={fieldErrors}
        />
        <TextField
          label="Probability %"
          name="probability"
          value={probability}
          onChange={(next) => setProbability(next.replace(/\D/g, ""))}
          errors={fieldErrors}
          hint="Weighted forecast is value × probability"
        />
        <TextField
          label="Expected close"
          name="expectedCloseAt"
          type="date"
          value={expectedCloseAt}
          onChange={setExpectedCloseAt}
          errors={fieldErrors}
        />
        <SelectField
          label="Linked tender"
          name="tenderId"
          value={tenderId}
          onChange={setTenderId}
          options={tenders}
          errors={fieldErrors}
          placeholder="None"
          hint="Ties the deal to the bid it is pursued through"
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
        submitLabel="Create opportunity"
        onCancel={() => router.push("/crm/pipeline")}
        onSubmit={() =>
          submit(() =>
            createOpportunityAction({
              title,
              customerId: customerId || undefined,
              ownerId: ownerId || undefined,
              valueRands: value ? Number(value) : undefined,
              probability: probability ? Number(probability) : 25,
              expectedCloseAt: expectedCloseAt || undefined,
              tenderId: tenderId || undefined,
              description: description || undefined,
            }),
          )
        }
      />
    </Card>
  );
}
