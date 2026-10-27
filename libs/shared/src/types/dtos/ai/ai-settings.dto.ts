import { z } from 'zod';

/** AI features a model can be chosen for (mirrors the AiTask Prisma enum). */
export enum AiTask {
  DEFAULT = 'DEFAULT',
  EVENT_GENERATION = 'EVENT_GENERATION',
  EVENT_MODIFICATION = 'EVENT_MODIFICATION',
  POST_ACTIVITY_QUESTIONS = 'POST_ACTIVITY_QUESTIONS',
  FEEDBACK_EXTRACTION = 'FEEDBACK_EXTRACTION',
  TRAINING_LOAD_ESTIMATION = 'TRAINING_LOAD_ESTIMATION',
}

/** Every task an AI feature runs, i.e. all of them but DEFAULT. */
export const AI_FEATURE_TASKS = [
  AiTask.EVENT_GENERATION,
  AiTask.EVENT_MODIFICATION,
  AiTask.POST_ACTIVITY_QUESTIONS,
  AiTask.FEEDBACK_EXTRACTION,
  AiTask.TRAINING_LOAD_ESTIMATION,
] as const;
export type AiFeatureTask = (typeof AI_FEATURE_TASKS)[number];

/** Provider id of an OpenAI-compatible endpoint the user gives the URL of. */
export const CUSTOM_AI_PROVIDER = 'custom';

/** Error codes the API returns in `code` for AI failures. */
export enum AiErrorCode {
  /** No key of the user's and no hosted AI for this feature */
  NOT_CONFIGURED = 'AI_NOT_CONFIGURED',
  /** The provider rejected the key */
  CREDENTIAL_REJECTED = 'AI_CREDENTIAL_REJECTED',
  /** Quota exhausted or rate limited at the provider */
  QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED',
  /** The monthly allowance on the instance keys is used up */
  HOSTED_QUOTA_EXCEEDED = 'AI_HOSTED_QUOTA_EXCEEDED',
  /** Any other provider failure */
  PROVIDER_ERROR = 'AI_PROVIDER_ERROR',
  /** The user has not allowed their data to be sent to AI providers */
  CONSENT_REQUIRED = 'AI_CONSENT_REQUIRED',
}

export const aiProviderModelSchema = z.object({
  id: z.string(),
  /** false when the registry knows the model lacks native JSON output */
  structuredOutput: z.boolean().optional(),
});

export const aiProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  docUrl: z.string().nullable(),
  /** Featured providers are listed first in the settings */
  featured: z.boolean(),
  /** The user must give the endpoint URL (custom OpenAI-compatible) */
  requiresBaseUrl: z.boolean(),
  /** Local servers such as Ollama or LM Studio may run without a key */
  apiKeyOptional: z.boolean(),
  models: z.array(aiProviderModelSchema),
});
export type AiProvider = z.infer<typeof aiProviderSchema>;

export const createAiCredentialDtoSchema = z
  .object({
    provider: z.string().trim().min(1).max(100),
    label: z.string().trim().max(100).optional(),
    apiKey: z.string().trim().max(1000).default(''),
    baseUrl: z
      .string()
      .trim()
      .url()
      .max(500)
      .refine((url) => /^https?:\/\//.test(url), 'Must be an http(s) URL')
      .optional(),
  })
  .refine(
    (dto) => dto.provider !== CUSTOM_AI_PROVIDER || Boolean(dto.baseUrl),
    { message: 'A custom endpoint needs its base URL', path: ['baseUrl'] },
  );
export type CreateAiCredentialDto = z.infer<typeof createAiCredentialDtoSchema>;

export interface AiCredentialDto {
  aiCredentialId: number;
  provider: string;
  label: string;
  /** Last characters of the key; the key itself is never sent back */
  apiKeyHint: string;
  baseUrl: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export const testAiCredentialDtoSchema = z.object({
  modelId: z.string().trim().min(1).max(200),
});
export type TestAiCredentialDto = z.infer<typeof testAiCredentialDtoSchema>;

export interface TestAiCredentialResponseDto {
  ok: boolean;
  code?: AiErrorCode;
  message?: string;
}

export const aiModelPreferenceSchema = z.object({
  task: z.nativeEnum(AiTask),
  aiCredentialId: z.number().int().positive(),
  modelId: z.string().trim().min(1).max(200),
});
export type AiModelPreferenceDto = z.infer<typeof aiModelPreferenceSchema>;

/** Replaces all of the user's model choices; tasks left out use DEFAULT. */
export const updateAiModelPreferencesDtoSchema = z.object({
  preferences: z
    .array(aiModelPreferenceSchema)
    .max(Object.keys(AiTask).length)
    .refine(
      (list) => new Set(list.map((item) => item.task)).size === list.length,
      'Each task can only be set once',
    ),
});
export type UpdateAiModelPreferencesDto = z.infer<
  typeof updateAiModelPreferencesDtoSchema
>;

export type AiAccessSource = 'own_key' | 'hosted';

export interface AiTaskAccessDto {
  available: boolean;
  source: AiAccessSource | null;
  /** Provider and model that would run, when available */
  provider: string | null;
  modelId: string | null;
}

/** Tokens the user's AI calls used this month. */
export interface AiUsageDto {
  /** On the instance keys, counted against the allowance */
  hostedTokens: number;
  /** On the user's own keys, billed to them by their provider */
  ownKeyTokens: number;
  /** Share of the monthly AI budget used, from 0 to 1; null when unlimited */
  hostedBudgetUsed: number | null;
  /** Start of next month (UTC), when the count starts again */
  resetsAt: string;
}

export interface AiAccessDto {
  tasks: Record<AiFeatureTask, AiTaskAccessDto>;
  /** The user's plan or the instance gives access to the instance keys */
  hostedAccess: boolean;
  /** Subscribing would give access to the instance keys */
  upgradeUnlocksHosted: boolean;
  /** Custom OpenAI-compatible endpoints can be added on this instance */
  customEndpointsAllowed: boolean;
  /** The monthly allowance on the instance keys is used up */
  hostedQuotaExhausted: boolean;
  usage: AiUsageDto;
  /**
   * The user allowed their data to be sent to the AI providers above. No AI
   * runs on their data without it; `tasks` say what would run once allowed.
   */
  dataSharingConsent: boolean;
  /**
   * With an athlete: whether that athlete allowed it, which background
   * features on their activities need. Null without an athlete.
   */
  athleteDataSharingConsent: boolean | null;
  /** Provider transcribing voice notes, when the instance offers it */
  transcriptionProvider: string | null;
}
