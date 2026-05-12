import type { NormalizedOmInput, OmInputValidationResult } from "@/lib/om/types";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateNormalizedOmInput(input: NormalizedOmInput): OmInputValidationResult {
  const errors: string[] = [];
  const warnings = [...(input.warnings ?? [])];

  if (!input.propertyId?.trim()) errors.push("propertyId is required");
  if (!input.slug?.trim()) errors.push("slug is required");
  if (!input.title?.trim()) errors.push("title is required");
  if (!input.address?.full?.trim()) errors.push("address.full is required");
  if (!Array.isArray(input.transactionTypes) || input.transactionTypes.length === 0) warnings.push("transactionTypes missing");

  if (!isFiniteNumber(input.location?.lat) || !isFiniteNumber(input.location?.lng)) {
    warnings.push("location coordinates missing or invalid");
  }

  if (!input.content.propertyDescription && !input.content.saleDescription && !input.content.leaseDescription) {
    warnings.push("property narrative missing");
  }

  if (!input.brokerProfile.leadBroker) warnings.push("lead broker missing");
  if (!input.brokerProfile.ownerEmail) warnings.push("owner email missing");
  if (!input.images.length) warnings.push("no OM images available");

  return {
    ok: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
  };
}
