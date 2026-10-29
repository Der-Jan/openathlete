import { AiFeatureTask, AiTask } from '@openathlete/shared';

/**
 * Models used with the instance keys ("hosted AI"), as `provider/model`.
 * Each can be overridden by its environment variables (first set wins, later
 * names are kept for older configurations), and AI_MODEL_DEFAULT replaces
 * every default at once, e.g. to run everything on one provider.
 */
export const HOSTED_MODEL_ENV_VARS: Record<AiFeatureTask, string[]> = {
  [AiTask.EVENT_GENERATION]: ['AI_MODEL_EVENT_GENERATION'],
  [AiTask.EVENT_MODIFICATION]: ['AI_MODEL_EVENT_MODIFICATION'],
  [AiTask.POST_ACTIVITY_QUESTIONS]: ['AI_MODEL_POST_ACTIVITY_FEEDBACK'],
  [AiTask.FEEDBACK_EXTRACTION]: [
    'AI_MODEL_FEEDBACK_EXTRACTION',
    'AI_MODEL_EXTRACT_RPE',
    'AI_MODEL_EXTRACT_INJURY',
  ],
  [AiTask.TRAINING_LOAD_ESTIMATION]: ['AI_MODEL_TRIMP_ESTIMATION'],
};

/**
 * GPT-5.6 Luna gives the best quality for its price among small models
 * (October 2026), with native structured output, so hosted AI runs on a
 * single OpenAI key within the Supporter budget.
 */
const DEFAULT_HOSTED_MODEL = 'openai/gpt-5.6-luna';

export const DEFAULT_HOSTED_MODELS: Record<AiFeatureTask, string> = {
  [AiTask.EVENT_GENERATION]: DEFAULT_HOSTED_MODEL,
  [AiTask.EVENT_MODIFICATION]: DEFAULT_HOSTED_MODEL,
  [AiTask.POST_ACTIVITY_QUESTIONS]: DEFAULT_HOSTED_MODEL,
  [AiTask.FEEDBACK_EXTRACTION]: DEFAULT_HOSTED_MODEL,
  [AiTask.TRAINING_LOAD_ESTIMATION]: DEFAULT_HOSTED_MODEL,
};

export type ClaudeEffort = 'low' | 'medium' | 'high';

/**
 * Reasoning effort per feature on the Claude models that take one (the 5.x
 * generation, which reasons by default and bills it as output): the short
 * background extractions need little, workouts more.
 */
export const CLAUDE_EFFORT: Record<AiFeatureTask, ClaudeEffort> = {
  [AiTask.EVENT_GENERATION]: 'medium',
  [AiTask.EVENT_MODIFICATION]: 'medium',
  [AiTask.POST_ACTIVITY_QUESTIONS]: 'low',
  [AiTask.FEEDBACK_EXTRACTION]: 'low',
  [AiTask.TRAINING_LOAD_ESTIMATION]: 'low',
};

/** The effort to send, or none: older Claude models reject the parameter */
export function claudeEffortFor(
  task: AiFeatureTask,
  provider: string,
  modelId: string,
): ClaudeEffort | undefined {
  return provider === 'anthropic' &&
    /^claude-(haiku|sonnet|opus|fable)-5/.test(modelId)
    ? CLAUDE_EFFORT[task]
    : undefined;
}

/** US dollars per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
}

/**
 * Standard prices of the models hosted AI is likely to run, to charge calls
 * against the monthly budget (AI_HOSTED_MONTHLY_BUDGET_USD). Update them
 * when providers change their prices.
 */
export const HOSTED_MODEL_PRICES: Record<string, ModelPrice> = {
  'openai/gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'openai/gpt-5.4-nano': { input: 0.2, output: 1.25 },
  'openai/gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'openai/gpt-5-nano': { input: 0.05, output: 0.4 },
  'openai/gpt-5-mini': { input: 0.25, output: 2 },
  'openai/gpt-5.1': { input: 1.25, output: 10 },
  'openai/gpt-5': { input: 1.25, output: 10 },
  // Haiku 5.5 costs more beyond 100K prompt tokens, which no feature sends
  'anthropic/claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'anthropic/claude-sonnet-5-5': { input: 2, output: 10 },
  'anthropic/claude-opus-5-5': { input: 4, output: 20 },
  'anthropic/claude-haiku-4-5': { input: 1, output: 5 },
  // Gemini 3.x prices double on 1 January 2027; these are the new ones
  'google/gemini-3.1-flash-lite': { input: 0.5, output: 3 },
  'google/gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'google/gemini-2.5-flash': { input: 0.3, output: 2.5 },
};

/**
 * A model missing from the table is charged like a flagship one, so that a
 * new configuration can never spend more than the budget.
 */
export const UNKNOWN_MODEL_PRICE: ModelPrice = { input: 5, output: 30 };

/** Cost of a call on the instance keys, in millionths of a US dollar. */
export function hostedCallCostMicroUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = HOSTED_MODEL_PRICES[model] ?? UNKNOWN_MODEL_PRICE;
  // A price per million tokens is the cost of one token in micro-dollars;
  // rounding first keeps float noise (0.1 + 0.2) from adding a micro-dollar
  const cost = inputTokens * price.input + outputTokens * price.output;
  return Math.ceil(Math.round(cost * 1000) / 1000);
}

/** Hosted model for a task, from the environment or the defaults above. */
export function hostedModelFor(
  task: AiFeatureTask,
  env: Record<string, string | undefined>,
): string {
  const configured = HOSTED_MODEL_ENV_VARS[task]
    .map((name) => env[name])
    .find(Boolean);
  return configured || env.AI_MODEL_DEFAULT || DEFAULT_HOSTED_MODELS[task];
}
