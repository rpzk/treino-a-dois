export type ExchangeResult = {
  patient_fhir_id: string;
  tenant_schema: string;
  fit_training_enabled: boolean;
};

export async function exchangeHealthcoreCode(input: {
  code: string;
  issuer: string;
}): Promise<ExchangeResult> {
  const secret = process.env.FITCORE_EXCHANGE_SECRET?.trim();
  if (!secret) {
    throw new Error("FITCORE_EXCHANGE_SECRET missing");
  }
  const issuer = input.issuer.replace(/\/$/, "");
  const url = `${issuer}/api/v1/portal/my-training/exchange/`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-FitCore-Exchange-Secret": secret,
    },
    body: JSON.stringify({ code: input.code }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Exchange failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  return (await response.json()) as ExchangeResult;
}
