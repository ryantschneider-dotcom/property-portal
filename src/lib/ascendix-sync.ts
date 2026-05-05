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

type PortalListingStatus = "active" | "inactive" | "leased" | "sold";

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
  const envelope = `<?xml version="1.0" encoding="utf-8" ?>
<env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">
  <env:Body>
    <n1:login xmlns:n1="urn:partner.soap.sforce.com">
      <n1:username>${xmlEscape(config.username)}</n1:username>
      <n1:password>${xmlEscape(config.password + config.securityToken)}</n1:password>
    </n1:login>
  </env:Body>
</env:Envelope>`;

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

async function salesforcePatch(auth: Awaited<ReturnType<typeof salesforceLogin>>, sobject: string, id: string, body: Record<string, unknown>) {
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

  const data = (snapshot.data() as Record<string, any> | undefined) ?? {};
  const sourceIds = (data.sourceIds ?? {}) as Record<string, any>;
  const propertyId = typeof sourceIds.ascendixPropertyId === "string" ? sourceIds.ascendixPropertyId : null;
  const listingId = typeof sourceIds.ascendixListingId === "string" ? sourceIds.ascendixListingId : null;
  const dealId = typeof sourceIds.ascendixDealId === "string" ? sourceIds.ascendixDealId : null;

  if (!propertyId && !listingId && !dealId) {
    const skipped = {
      skipped: true,
      success: false,
      message: "No Ascendix IDs linked on this Listing Stream record",
      propertyId,
      listingId,
      dealId,
      listingStatus: null,
      dealStatus: null,
      dealStage: null,
    } satisfies SyncResult;

    await docRef.set(
      {
        meta: {
          ascendixSync: {
            status: "skipped",
            message: skipped.message,
            lastAttemptAt: FieldValue.serverTimestamp(),
          },
        },
      },
      { merge: true },
    );

    return skipped;
  }

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
  });

  const dealPayload = compact({
    ascendix__Status__c: mapped.dealStatus,
    ascendix__SalesStage__c: mapped.dealStage,
  });

  try {
    const auth = await salesforceLogin();
    if (propertyId) {
      await salesforcePatch(auth, "ascendix__Property__c", propertyId, propertyPayload);
    }
    if (listingId) {
      await salesforcePatch(auth, "ascendix__Listing__c", listingId, listingPayload);
    }
    if (dealId) {
      await salesforcePatch(auth, "ascendix__Deal__c", dealId, dealPayload);
    }

    const success = {
      skipped: false,
      success: true,
      message: "Ascendix sync completed",
      propertyId,
      listingId,
      dealId,
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
            propertyId,
            listingStatus: success.listingStatus,
            dealStatus: success.dealStatus,
            dealStage: success.dealStage,
            listingId,
            dealId,
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
