export type MailchimpAudience = {
  id: string;
  name: string;
  memberCount: number | null;
};

export type MailchimpDraftCampaignInput = {
  audienceId: string;
  subjectLine: string;
  fromName: string;
  fromEmail: string;
  title: string;
  previewText?: string;
  html: string;
};

function getMailchimpConfig() {
  const apiKey = process.env.MAILCHIMP_API_KEY?.trim();
  const serverPrefix = (process.env.MAILCHIMP_SERVER_PREFIX || apiKey?.split("-").pop() || "").trim();
  if (!apiKey || !serverPrefix) {
    throw new Error("Mailchimp is not configured. Add MAILCHIMP_API_KEY and MAILCHIMP_SERVER_PREFIX in Vercel.");
  }
  return {
    apiKey,
    baseUrl: `https://${serverPrefix}.api.mailchimp.com/3.0`,
    authHeader: `Basic ${Buffer.from(`mission-control:${apiKey}`).toString("base64")}`,
  };
}

async function mailchimpFetch(path: string, init: RequestInit = {}) {
  const config = getMailchimpConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: config.authHeader,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : typeof data.title === "string" ? data.title : "Mailchimp request failed.";
    throw new Error(detail);
  }
  return data as Record<string, unknown>;
}

export async function listMailchimpAudiences(): Promise<MailchimpAudience[]> {
  const data = await mailchimpFetch("/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count,total_items");
  const lists = Array.isArray(data.lists) ? data.lists : [];
  return lists.map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const stats = record.stats && typeof record.stats === "object" ? record.stats as Record<string, unknown> : {};
    return {
      id: String(record.id || ""),
      name: String(record.name || "Untitled Audience"),
      memberCount: typeof stats.member_count === "number" ? stats.member_count : null,
    };
  }).filter((item) => item.id);
}

export async function createMailchimpDraftCampaign(input: MailchimpDraftCampaignInput) {
  const campaign = await mailchimpFetch("/campaigns", {
    method: "POST",
    body: JSON.stringify({
      type: "regular",
      recipients: { list_id: input.audienceId },
      settings: {
        subject_line: input.subjectLine,
        preview_text: input.previewText || "PIER Commercial listing update",
        title: input.title,
        from_name: input.fromName,
        reply_to: input.fromEmail,
      },
    }),
  });
  const campaignId = String(campaign.id || "");
  if (!campaignId) throw new Error("Mailchimp did not return a campaign id.");
  await mailchimpFetch(`/campaigns/${encodeURIComponent(campaignId)}/content`, {
    method: "PUT",
    body: JSON.stringify({ html: input.html }),
  });
  return {
    id: campaignId,
    webId: campaign.web_id ?? null,
    status: campaign.status ?? "save",
    archiveUrl: campaign.archive_url ?? null,
  };
}
