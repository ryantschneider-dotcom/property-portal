import { FieldValue } from "firebase-admin/firestore";
import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";

type SyncResult = {
  skipped: boolean;
  success: boolean;
  message: string;
  propertyId: string | null;
  listingId: string | null;
  dealId: string | null;
  listingStatus: string | null;
  dealStatus: string | null;
  dealStage: string | null;
};

const API_VERSION = "v61.0";

type SalesforceConfig = {
  loginUrl: string;
  username: string;
  password: string;
  securityToken: string;
};

type PortalListingStatus = "active" | "inactive" | "under_contract" | "leased" | "sold";

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required Ascendix env var: ${key}`);
  }
  return value;
}

function loadConfig(): SalesforceConfig {
  return {
    loginUrl: process.env.SF_LOGIN_URL?.trim() || "https://login.salesforce.com",
    username: requireEnv("SF_USERNAME"),
    password: requireEnv("SF_PASSWORD"),
    securityToken: requireEnv("SF_SECURITY_TOKEN"),
  };
}

async function salesforceLogin() {
  const config = loadConfig();
  const envelope = `<?xml version=\"1.0\" encoding=\"utf-8\" ?>
<env:Envelope xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\"\n              xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"\n              xmlns:env=\"http://schemas.xmlsoap.org/soap/envelope/\">\n  <env:Body>\n    <n1:login xmlns:n1=\"urn:partner.soap.sforce.com\">\n      <n1:username>${xmlEscape(config.username)}</n1:username>\n      <n1:password>${xmlEscape(config.password + config.securityToken)}</n1:password>\n    </n1:login>\n  </env:Body>\n</env:Envelope>`;

  const response = await fetch(`${config.loginUrl}/services/Soap/u/${API_VERSION}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=UTF-8",
      SOAPAction: "login",
    },
    body: envelope,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Salesforce login failed (${response.status})`);
  }

  const sessionMatch = text.match(/<sessionId>([^<]+)<\/sessionId>/);
  const serverMatch = text.match(/<serverUrl>(https:\/\/[^<]+)<\/serverUrl>/);
  if (!sessionMatch || !serverMatch) {
    throw new Error("Salesforce login missing session/server URL");
  }

  const instanceUrlMatch = serverMatch[1].match(/^(https:\/\/[^/]+)/);
  if (!instanceUrlMatch) {
    throw new Error("Unable to parse Salesforce instance URL");
  }

  return {
    sessionId: sessionMatch[1],
    instanceUrl: instanceUrlMatch[1],
  };
}

async function salesforceCreate(auth: Awaited<ReturnType<typeof salesforceLogin>>, sobject: string, body: Record<string, unknown>) {
  const response = await fetch(`${auth.instanceUrl}/services/data/${API_VERSION}/sobjects/${sobject}/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.sessionId}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Salesforce ${sobject} create failed (${response.status}): ${text}`);
  }
  const payload = (await response.json()) as { id?: string; success?: boolean; errors?: Array<{ message: string }> };

  if (!payload.success || !payload.id) {
    throw new Error(`Salesforce ${sobject} create failed: ${payload.errors?.map((err) => err.message).join(", ") || "Unknown error"}`);
  }
  return payload.id;
}

export async function salesforcePatch(auth: Awaited<ReturnType<typeof salesforceLogin>>, sobject: string, id: string, body: Record<string, unknown>) {
  const response = await fetch(`${auth.instanceUrl}/services/data/${API_VERSION}/sobjects/${sobject}/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${auth.sessionId}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Salesforce ${sobject} patch failed (${response.status}): ${text}`);
  }
}

async function salesforceQuery(auth: Awaited<ReturnType<typeof salesforceLogin>>, soql: string) {
  const url = new URL(`${auth.instanceUrl}/services/data/${API_VERSION}/query`);
  url.searchParams.set('q', soql);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${auth.sessionId}`,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Salesforce query failed (${response.status}): ${text}`);
  return JSON.parse(text);
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function mapStatusToAscendix(status: PortalListingStatus, transactionLabel: string | null | undefined) {
  const transaction = (transactionLabel ?? "").toLowerCase();

  if (status === "leased") {
    return {
      listingStatus: "Closed",
      dealStatus: "Won",
      dealStage: "Lease Execution",
    };
  }

  if (status === "sold") {
    return {
      listingStatus: "Closed",
      dealStatus: "Won",
      dealStage: "Execution/In Closing",
    };
  }

  if (status === "inactive") {
    return {
      listingStatus: "Other",
      dealStatus: "Lost",
      dealStage: "Completed",
    };
  }

  if (status === "under_contract") {
    return {
      listingStatus: "Active",
      dealStatus: "Open",
      dealStage: transaction.includes("lease") && !transaction.includes("sale") ? "Lease Execution" : "Execution/In Closing",
    };
  }

  return {
    listingStatus: "Active",
    dealStatus: "Open",
    dealStage: transaction.includes("lease") && !transaction.includes("sale") ? "In the Market/Tracking" : "In the Market/Tracking",
  };
}

export async function syncPropertyToAscendix(documentId: string): Promise<SyncResult> {
  const docRef = db.collection(PROPERTIES_COLLECTION).doc(documentId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    return {
      skipped: true,
      success: false,
      message: "Property document not found for Ascendix sync",
      propertyId: null,
      listingId: null,
      dealId: null,
      listingStatus: null,
      dealStatus: null,
      dealStage: null,
    };
  }

  // Ascendix sync maps a flexible Firestore document shape sourced from multiple importers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (snapshot.data() as Record<string, any> | undefined) ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sourceIds = (data.sourceIds ?? {}) as Record<string, any>;
  const propertyId = typeof sourceIds.ascendixPropertyId === "string" ? sourceIds.ascendixPropertyId : null;
  const listingId = typeof sourceIds.ascendixListingId === "string" ? sourceIds.ascendixListingId : null;
  const dealId = typeof sourceIds.ascendixDealId === "string" ? sourceIds.ascendixDealId : null;

  const mapped = mapStatusToAscendix((String(data.status || "active").toLowerCase() as PortalListingStatus), data.visibility?.transactionLabel);

  const propertyPayload = compact({
    Name: typeof data.address?.street === "string" ? data.address.street.trim() || undefined : undefined,
    ascendix__Street__c: typeof data.address?.street === "string" ? data.address.street.trim() || undefined : undefined,
    ascendix__City__c: typeof data.address?.city === "string" ? data.address.city.trim() || undefined : undefined,
    ascendix__State__c: typeof data.address?.state === "string" ? data.address.state.trim() || undefined : undefined,
    ascendix__PostalCode__c: typeof data.address?.zip === "string" ? data.address.zip.trim() || undefined : undefined,
    ascendix__TotalBuildingArea__c: typeof data.property?.buildingSizeSf === "number" ? data.property.buildingSizeSf : undefined,
    ascendix__GLA__c: typeof data.property?.grossLeasableArea === "number" ? data.property.grossLeasableArea : undefined,
    ascendix__YearBuilt__c: data.property?.yearBuilt != null ? String(data.property.yearBuilt) : undefined,
    ascendix__LandArea__c: typeof data.property?.lotSizeAcres === "number" ? data.property.lotSizeAcres : undefined,
  });

  const listingPayload = compact({
    Name: typeof data.title === "string" ? data.title.trim() || undefined : undefined,
    ascendix__Status__c: mapped.listingStatus,
    ascendix__Property__c: propertyId || undefined, 
  });

  const dealPayload = compact({
    Name: typeof data.title === "string" ? data.title.trim() || undefined : undefined, 
    ascendix__Status__c: mapped.dealStatus,
    ascendix__SalesStage__c: mapped.dealStage,
  });

  let resolvedPropertyId = propertyId;
  let resolvedListingId = listingId;
  let resolvedDealId = dealId;

  if (!propertyId && !listingId && !dealId) {
    const auth = await salesforceLogin();
    console.log(`[ascendix-sync] Creating new Ascendix records for ${documentId}`);
    const newPropertyId = await salesforceCreate(auth, "ascendix__Property__c", propertyPayload);
    const newDealId = await salesforceCreate(auth, "ascendix__Deal__c", dealPayload);

    const newListingPayload = {
      ...listingPayload,
      ascendix__Property__c: newPropertyId, 
      ascendix__Deal__c: newDealId, 
    };
    const newListingId = await salesforceCreate(auth, "ascendix__Listing__c", newListingPayload);

    resolvedPropertyId = newPropertyId;
    resolvedListingId = newListingId;
    resolvedDealId = newDealId;

    await docRef.set(
      {
        sourceIds: {
          ascendixPropertyId: newPropertyId,
          ascendixListingId: newListingId,
          ascendixDealId: newDealId,
        },
        meta: {
          ascendixSync: {
            status: "created",
            message: "Ascendix records created and linked",
            lastAttemptAt: FieldValue.serverTimestamp(),
            propertyId: newPropertyId,
            listingId: newListingId,
            dealId: newDealId,
          },
        },
      },
      { merge: true },
    );
    console.log(`[ascendix-sync] Created records: Property=${newPropertyId}, Listing=${newListingId}, Deal=${newDealId}`);

    return {
      skipped: false,
      success: true,
      message: "Ascendix records created and linked. Full sync will occur on next run.",
      propertyId: newPropertyId,
      listingId: newListingId,
      dealId: newDealId,
      listingStatus: mapped.listingStatus,
      dealStatus: mapped.dealStatus,
      dealStage: mapped.dealStage,
    };
  }

  try {
    const auth = await salesforceLogin();
    if (resolvedPropertyId) {
      await salesforcePatch(auth, "ascendix__Property__c", resolvedPropertyId, propertyPayload);
    }
    if (resolvedListingId) {
      await salesforcePatch(auth, "ascendix__Listing__c", resolvedListingId, listingPayload);
    }
    if (resolvedDealId) {
      await salesforcePatch(auth, "ascendix__Deal__c", resolvedDealId, dealPayload);
    }

    const success = {
      skipped: false,
      success: true,
      message: "Ascendix sync completed",
      propertyId: resolvedPropertyId,
      listingId: resolvedListingId,
      dealId: resolvedDealId,
      listingStatus: mapped.listingStatus,
      dealStatus: mapped.dealStatus,
      dealStage: mapped.dealStage,
    } satisfies SyncResult;

    await docRef.set(
      {
        meta: {
          ascendixSync: {
            status: "success",
            message: success.message,
            lastAttemptAt: FieldValue.serverTimestamp(),
            propertyId: resolvedPropertyId,
            listingStatus: success.listingStatus,
            dealStatus: success.dealStatus,
            dealStage: success.dealStage,
            listingId: resolvedListingId,
            dealId: resolvedDealId,
          },
        },
      },
      { merge: true },
    );

    return success;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ascendix sync failed";

    await docRef.set(
      {
        meta: {
          ascendixSync: {
            status: "error",
            message,
            lastAttemptAt: FieldValue.serverTimestamp(),
            listingId,
            dealId,
            listingStatus: mapped.listingStatus,
            dealStatus: mapped.dealStatus,
            dealStage: mapped.dealStage,
          },
        },
      },
      { merge: true },
    );

    return {
      skipped: false,
      success: false,
      message,
      propertyId,
      listingId,
      dealId,
      listingStatus: mapped.listingStatus,
      dealStatus: mapped.dealStatus,
      dealStage: mapped.dealStage,
    };
  }
}

// NEW FUNCTION: createOrUpdateAscendixAccount
export async function createOrUpdateAscendixAccount(
  auth: Awaited<ReturnType<typeof salesforceLogin>>,
  accountName: string,
): Promise<string> {
  if (!accountName?.trim()) {
    console.log('[ascendix-sync] Skipping Account create/update: No account name provided.');
    return ''; 
  }

  const query = `SELECT Id FROM Account WHERE Name = '${xmlEscape(accountName)}' LIMIT 1`;
  const result = await salesforceQuery(auth, query);
  const existingAccountId = result.records.length > 0 ? result.records[0].Id : null;

  const accountPayload = compact({
    Name: accountName,
  });

  if (existingAccountId) {
    console.log(`[ascendix-sync] Updating existing Account: ${accountName} (ID: ${existingAccountId})`);
    await salesforcePatch(auth, "Account", existingAccountId, accountPayload);
    return existingAccountId;
  } else {
    console.log(`[ascendix-sync] Creating new Account: ${accountName}`);
    const newAccountId = await salesforceCreate(auth, "Account", accountPayload);
    return newAccountId;
  }
}

// NEW FUNCTION: createOrUpdateAscendixContact
export async function createOrUpdateAscendixContact(
  auth: Awaited<ReturnType<typeof salesforceLogin>>,
  contactName: string,
  email: string | null = null,
  phone: string | null = null,
  accountId: string | null = null, 
): Promise<string> {
  if (!contactName?.trim()) {
    console.log('[ascendix-sync] Skipping Contact create/update: No contact name provided.');
    return '';
  }

  let existingContactId: string | null = null;

  if (email?.trim()) {
    const emailQuery = `SELECT Id FROM Contact WHERE Email = '${xmlEscape(email)}' LIMIT 1`;
    const emailResult = await salesforceQuery(auth, emailQuery);
    existingContactId = emailResult.records.length > 0 ? emailResult.records[0].Id : null;
  }

  if (!existingContactId && contactName?.trim()) {
    let nameQuery = `SELECT Id FROM Contact WHERE Name = '${xmlEscape(contactName)}'`;
    if (accountId) {
      nameQuery += ` AND AccountId = '${accountId}'`;
    }
    nameQuery += ` LIMIT 1`;
    const nameResult = await salesforceQuery(auth, nameQuery);
    existingContactId = nameResult.records.length > 0 ? nameResult.records[0].Id : null;
  }

  const contactPayload = compact({
    LastName: contactName, 
    Email: email?.trim() || undefined,
    Phone: phone?.trim() || undefined,
    AccountId: accountId || undefined,
  });

  if (existingContactId) {
    console.log(`[ascendix-sync] Updating existing Contact: ${contactName} (ID: ${existingContactId})`);
    await salesforcePatch(auth, "Contact", existingContactId, contactPayload);
    return existingContactId;
  } else {
    console.log(`[ascendix-sync] Creating new Contact: ${contactName}`);
    const newContactId = await salesforceCreate(auth, "Contact", contactPayload);
    return newContactId;
  }
}
export { salesforceLogin };
