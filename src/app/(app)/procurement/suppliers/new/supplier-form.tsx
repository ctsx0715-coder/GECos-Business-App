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
import { createSupplierAction } from "../../actions";

/**
 * Putting a supplier on the register.
 *
 * The two fields that look like paperwork are the two that matter later. A
 * lapsed tax clearance on a public-sector contract is the client's problem and
 * therefore ours; the B-BBEE level is what a tender asks for a year on, when
 * nobody can reconstruct the spend split from a shoebox of invoices. Both are
 * optional here, because a supplier is often added in a hurry against a
 * delivery that is already on its way — and both are surfaced on the register
 * so the gap is visible rather than forgotten.
 */

/** 1 is the best. Nothing chosen means they have not given us a certificate. */
const BBBEE_LEVELS = Array.from({ length: 8 }, (_, index) => ({
  value: String(index + 1),
  label: `Level ${index + 1}`,
}));

export function SupplierForm() {
  const [name, setName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [bbbeeLevel, setBbbeeLevel] = useState("");
  const [taxClearanceExpiresAt, setTaxClearanceExpiresAt] = useState("");
  const [supplies, setSupplies] = useState("");
  const [notes, setNotes] = useState("");

  const router = useRouter();
  const { pending, message, fieldErrors, submit } = useFormAction();

  return (
    <Card>
      <CardHeader
        title="The supplier"
        description="Only the name is required. The rest can follow"
      />
      <FormGrid>
          <FullWidth>
            <TextField
              label="Registered name"
              name="name"
              value={name}
              onChange={setName}
              errors={fieldErrors}
              required
              placeholder="Afrimat Readymix (Pty) Ltd"
            />
          </FullWidth>
          <TextField
            label="Trading as"
            name="tradingName"
            value={tradingName}
            onChange={setTradingName}
            errors={fieldErrors}
            hint="If it differs from the registered name"
          />
          <TextField
            label="Registration number"
            name="registrationNumber"
            value={registrationNumber}
            onChange={setRegistrationNumber}
            errors={fieldErrors}
            placeholder="2014/123456/07"
          />
          <TextField
            label="VAT number"
            name="vatNumber"
            value={vatNumber}
            onChange={setVatNumber}
            errors={fieldErrors}
            placeholder="4123456789"
          />
          <SelectField
            label="B-BBEE level"
            name="bbbeeLevel"
            value={bbbeeLevel}
            onChange={setBbbeeLevel}
            options={BBBEE_LEVELS}
            errors={fieldErrors}
            placeholder="No certificate"
            hint="What a tender asks for, long after the fact"
          />
          <TextField
            label="Tax clearance expires"
            name="taxClearanceExpiresAt"
            type="date"
            value={taxClearanceExpiresAt}
            onChange={setTaxClearanceExpiresAt}
            errors={fieldErrors}
            hint="Flagged on the register once it lapses"
          />
          <FullWidth>
            <TextField
              label="What they supply"
              name="supplies"
              value={supplies}
              onChange={setSupplies}
              errors={fieldErrors}
              placeholder="readymix, aggregate, pump hire"
              hint="Separated by commas, in the words the buyer uses"
            />
          </FullWidth>
          <TextField
            label="Contact"
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
          <FullWidth>
            <TextField
              label="Address"
              name="address"
              value={address}
              onChange={setAddress}
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
          onCancel={() => router.push("/procurement/suppliers")}
          onSubmit={() =>
            submit(() =>
              createSupplierAction({
                name,
                tradingName: tradingName || undefined,
                registrationNumber: registrationNumber || undefined,
                vatNumber: vatNumber || undefined,
                contactName: contactName || undefined,
                email: email || undefined,
                phone: phone || undefined,
                address: address || undefined,
                bbbeeLevel: bbbeeLevel ? Number(bbbeeLevel) : undefined,
                taxClearanceExpiresAt: taxClearanceExpiresAt || undefined,
                supplies: supplies
                  .split(",")
                  .map((part) => part.trim())
                  .filter(Boolean),
                notes: notes || undefined,
              }),
            )
          }
        />
    </Card>
  );
}
