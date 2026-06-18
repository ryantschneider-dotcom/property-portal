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

export type MailchimpCampaignSummary = {
  id: string;
  webId: unknown;
  status: unknown;
  archiveUrl: string | null;
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

function summarizeCampaign(campaign: Record<string, unknown>): MailchimpCampaignSummary {
  return {
    id: String(campaign.id || ""),
    webId: campaign.web_id ?? null,
    status: campaign.status ?? "save",
    archiveUrl: typeof campaign.archive_url === "string" ? campaign.archive_url : null,
  };
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
        auto_footer: false,
        inline_css: true,
      },
      tracking: {
        opens: true,
        html_clicks: true,
        text_clicks: true,
      },
    }),
  });
  const campaignId = String(campaign.id || "");
  if (!campaignId) throw new Error("Mailchimp did not return a campaign id.");
  await mailchimpFetch(`/campaigns/${encodeURIComponent(campaignId)}/content`, {
    method: "PUT",
    body: JSON.stringify({ html: input.html }),
  });
  return summarizeCampaign(campaign);
}

export async function getMailchimpCampaignContent(campaignId: string) {
  const id = encodeURIComponent(campaignId);
  const data = await mailchimpFetch(`/campaigns/${id}/content?fields=html,plain_text`);
  return {
    html: typeof data.html === "string" ? data.html : "",
    plainText: typeof data.plain_text === "string" ? data.plain_text : "",
  };
}

export async function getMailchimpCampaign(campaignId: string) {
  const data = await mailchimpFetch(`/campaigns/${encodeURIComponent(campaignId)}?fields=id,web_id,status,archive_url,settings.subject_line,settings.reply_to,settings.from_name`);
  return summarizeCampaign(data);
}

export async function sendMailchimpTestEmail(input: { campaignId: string; brokerEmail: string }) {
  await mailchimpFetch(`/campaigns/${encodeURIComponent(input.campaignId)}/actions/test`, {
    method: "POST",
    body: JSON.stringify({ test_emails: [input.brokerEmail], send_type: "html" }),
  });
  return { ok: true, campaignId: input.campaignId, testEmail: input.brokerEmail, sentAt: new Date().toISOString() };
}

export async function sendMailchimpCampaign(campaignId: string) {
  await mailchimpFetch(`/campaigns/${encodeURIComponent(campaignId)}/actions/send`, { method: "POST" });
  return { ok: true, campaignId, sentAt: new Date().toISOString() };
}
