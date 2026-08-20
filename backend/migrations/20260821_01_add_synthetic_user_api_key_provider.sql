ALTER TABLE public.user_api_keys
  DROP CONSTRAINT IF EXISTS user_api_keys_provider_check;

ALTER TABLE public.user_api_keys
  ADD CONSTRAINT user_api_keys_provider_check
  CHECK (provider IN ('claude', 'kimi', 'gemini', 'openai', 'openrouter', 'opencodego', 'vercel', 'synthetic', 'courtlistener'));
