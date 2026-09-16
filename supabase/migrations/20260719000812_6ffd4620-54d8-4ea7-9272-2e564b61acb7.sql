UPDATE public.challenges
SET config = jsonb_set(
      jsonb_set(config, '{ends}', '4'::jsonb, true),
      '{max_score}', '80'::jsonb, true
    ),
    updated_at = now()
WHERE slug = 'slimed';

UPDATE public.challenge_badge_thresholds
SET bronze = 25, silver = 40, gold = 55, platinum = 70, updated_at = now()
WHERE challenge_slug = 'slimed';