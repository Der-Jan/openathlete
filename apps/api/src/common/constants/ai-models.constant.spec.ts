import { AiTask } from '@openathlete/shared';

import {
  DEFAULT_HOSTED_MODELS,
  claudeEffortFor,
  hostedCallCostMicroUsd,
  hostedModelFor,
} from './ai-models.constant';

describe('hostedModelFor', () => {
  it('uses the built-in default without configuration', () => {
    expect(hostedModelFor(AiTask.EVENT_GENERATION, {})).toBe(
      DEFAULT_HOSTED_MODELS[AiTask.EVENT_GENERATION],
    );
  });

  it('lets AI_MODEL_DEFAULT replace every default', () => {
    const env = { AI_MODEL_DEFAULT: 'anthropic/claude-sonnet-4-5' };

    expect(hostedModelFor(AiTask.POST_ACTIVITY_QUESTIONS, env)).toBe(
      'anthropic/claude-sonnet-4-5',
    );
  });

  it('prefers the task variable over AI_MODEL_DEFAULT', () => {
    const env = {
      AI_MODEL_DEFAULT: 'anthropic/claude-sonnet-4-5',
      AI_MODEL_TRIMP_ESTIMATION: 'openai/gpt-5-mini',
    };

    expect(hostedModelFor(AiTask.TRAINING_LOAD_ESTIMATION, env)).toBe(
      'openai/gpt-5-mini',
    );
  });

  it('still reads the former feedback extraction variables', () => {
    expect(
      hostedModelFor(AiTask.FEEDBACK_EXTRACTION, {
        AI_MODEL_EXTRACT_RPE: 'openai/gpt-4o',
      }),
    ).toBe('openai/gpt-4o');
    expect(
      hostedModelFor(AiTask.FEEDBACK_EXTRACTION, {
        AI_MODEL_FEEDBACK_EXTRACTION: 'mistral/mistral-large-latest',
        AI_MODEL_EXTRACT_RPE: 'openai/gpt-4o',
      }),
    ).toBe('mistral/mistral-large-latest');
  });
});

describe('claudeEffortFor', () => {
  it('reasons more on workouts than on background extractions', () => {
    expect(
      claudeEffortFor(
        AiTask.EVENT_GENERATION,
        'anthropic',
        'claude-sonnet-5-5',
      ),
    ).toBe('medium');
    expect(
      claudeEffortFor(
        AiTask.FEEDBACK_EXTRACTION,
        'anthropic',
        'claude-haiku-5-5',
      ),
    ).toBe('low');
  });

  it('sends none to models that reject it', () => {
    expect(
      claudeEffortFor(AiTask.EVENT_GENERATION, 'anthropic', 'claude-haiku-4-5'),
    ).toBeUndefined();
    expect(
      claudeEffortFor(AiTask.EVENT_GENERATION, 'openai', 'gpt-5.6-luna'),
    ).toBeUndefined();
  });
});

describe('HOSTED_MODEL_PRICES', () => {
  it('prices the Claude models hosted AI runs on', () => {
    // 1,000 input and 1,000 output tokens on Haiku 5.5: $0.0006
    expect(
      hostedCallCostMicroUsd('anthropic/claude-haiku-5-5', 1000, 1000),
    ).toBe(600);
  });
});
