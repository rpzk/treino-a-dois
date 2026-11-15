export type HealthcoreAiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type HealthcoreAiCompleteResult = {
  content: string;
  provider: string;
  model: string;
  billing_mode: string;
  purpose: string;
};

export function exchangeSecret(): string {
  const secret = process.env.FITCORE_EXCHANGE_SECRET?.trim() || "";
  if (!secret) {
    throw new Error("FITCORE_EXCHANGE_SECRET missing");
  }
  return secret;
}

export function defaultIssuer(): string {
  return (
    process.env.HEALTHCORE_PUBLIC_URL?.trim().replace(/\/$/, "") ||
    "https://rp.rphealthtech.com"
  );
}

/** Call HealthCore LLM proxy — no provider API keys in FitCore. */
export async function healthcoreAiComplete(input: {
  messages: HealthcoreAiMessage[];
  purpose: string;
  tenantSchema: string;
  issuer?: string;
  jsonMode?: boolean;
}): Promise<HealthcoreAiCompleteResult> {
  let issuer = (input.issuer || defaultIssuer()).trim().replace(/\/$/, "");
  if (issuer.startsWith("http://")) {
    issuer = `https://${issuer.slice("http://".length)}`;
  }
  const url = `${issuer}/api/v1/internal/fitcore/ai/complete/`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-FitCore-Exchange-Secret": exchangeSecret(),
    },
    body: JSON.stringify({
      messages: input.messages,
      purpose: input.purpose,
      tenant_schema: input.tenantSchema,
      json_mode: Boolean(input.jsonMode),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `HealthCore AI failed (${response.status}): ${detail.slice(0, 240)}`,
    );
  }
  return (await response.json()) as HealthcoreAiCompleteResult;
}

export type HealthcoreAiVisionImage = {
  mime: string;
  dataBase64: string;
};

export type HealthcoreAiVisionResult = HealthcoreAiCompleteResult;

/** Call HealthCore vision proxy — images are sent as base64, no provider keys in FitCore. */
export async function healthcoreAiVision(input: {
  purpose: string;
  tenantSchema: string;
  system?: string;
  prompt: string;
  images: HealthcoreAiVisionImage[];
  issuer?: string;
}): Promise<HealthcoreAiVisionResult> {
  let issuer = (input.issuer || defaultIssuer()).trim().replace(/\/$/, "");
  if (issuer.startsWith("http://")) {
    issuer = `https://${issuer.slice("http://".length)}`;
  }
  const url = `${issuer}/api/v1/internal/fitcore/ai/vision/`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-FitCore-Exchange-Secret": exchangeSecret(),
    },
    body: JSON.stringify({
      purpose: input.purpose,
      tenant_schema: input.tenantSchema,
      ...(input.system ? { system: input.system } : {}),
      prompt: input.prompt,
      images: input.images.map((image) => ({
        mime: image.mime,
        data_base64: image.dataBase64,
      })),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `HealthCore AI vision failed (${response.status}): ${detail.slice(0, 240)}`,
    );
  }
  return (await response.json()) as HealthcoreAiVisionResult;
}
