/** Explicit selection prevents an exhausted provider from silently using another key. */
type ProviderEnvironment = {
  AI_PROVIDER?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  GROQ_VISION_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
};
export function providerConfig(env: ProviderEnvironment = process.env, vision = false) {
  const provider = env.AI_PROVIDER?.trim() || 'gemini';
  if (provider !== 'gemini' && provider !== 'groq')
    throw Object.assign(new Error('Invalid AI provider configuration.'), {
      code: 'CONFIG_INVALID',
    });
  return provider === 'groq'
    ? {
        provider,
        apiKey: env.GROQ_API_KEY?.trim(),
        model: vision
          ? env.GROQ_VISION_MODEL?.trim() || 'qwen/qwen3.8-27b'
          : env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b',
      }
    : { provider, apiKey: env.GEMINI_API_KEY?.trim(), model: env.GEMINI_MODEL?.trim() || '' };
}
