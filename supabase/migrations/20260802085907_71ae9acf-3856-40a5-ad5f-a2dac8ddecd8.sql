UPDATE public.challenges
SET rules = rules || '["Delivery order each end: Bowl 1 forehand, Bowl 2 forehand, Bowl 3 backhand, Bowl 4 backhand (skip the hands for any bowls already lost)."]'::jsonb
WHERE slug = 'keep-it-up'
  AND NOT (rules @> '["Delivery order each end: Bowl 1 forehand, Bowl 2 forehand, Bowl 3 backhand, Bowl 4 backhand (skip the hands for any bowls already lost)."]'::jsonb);