
-- Add multi-select conditions + green type to session/results tables
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS conditions text[];
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS green_type text;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS conditions_list text[];
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS green_type text;
ALTER TABLE public.challenge_results ADD COLUMN IF NOT EXISTS conditions_list text[];
ALTER TABLE public.challenge_results ADD COLUMN IF NOT EXISTS green_type text;

-- Update Drive Then Draw challenge setup wording
UPDATE public.challenges
SET setup = 'Drive Channel: Place a mat at short-to-medium length, lengthwise (same orientation as a bowls delivery mat). The objective is to drive over the mat.

Draw Target: Place a jack further up the rink, off centre. This represents the new jack position after the drive.'
WHERE slug = 'drive-then-draw';
