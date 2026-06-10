export type ModelRate = {
  model: string;
  inputPer1K: number;
  outputPer1K: number;
};

export const defaultModelRate: ModelRate = {
  model: "openai/gpt-5.4",
  inputPer1K: 0.01,
  outputPer1K: 0.03,
};

export function estimateTokens(text: string) {
  if (!text.trim()) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateCost(inputTokens: number, outputTokens: number, rate = defaultModelRate) {
  const inputCost = (inputTokens / 1000) * rate.inputPer1K;
  const outputCost = (outputTokens / 1000) * rate.outputPer1K;
  return Number((inputCost + outputCost).toFixed(4));
}
