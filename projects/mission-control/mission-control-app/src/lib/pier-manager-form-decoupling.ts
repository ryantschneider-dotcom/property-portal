export type ListingRevisionValidationInput = {
  selectedPropertyId: string;
  instructions: string;
  /** Deliberately accepted to prove revision validation ignores Email Blast state. */
  mailchimpAudienceId?: string | null;
};

export function getListingRevisionValidationError(input: ListingRevisionValidationInput): string | null {
  if (!input.selectedPropertyId.trim()) return "Select an active ListingStream listing before generating a revision draft.";
  if (!input.instructions.trim()) return "Describe the listing change before generating a revision draft.";
  return null;
}
