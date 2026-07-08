
-- Challenges system (separate from drills; does NOT contribute to BSI)

CREATE TABLE public.challenges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  setup text,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_label text NOT NULL DEFAULT 'Score',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.challenges TO anon, authenticated;
GRANT ALL ON public.challenges TO service_role;

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Challenges are viewable by everyone"
  ON public.challenges FOR SELECT
  USING (true);

CREATE TRIGGER update_challenges_updated_at
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.challenge_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  challenge_name text NOT NULL,
  category text,
  score integer NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  location text,
  conditions text,
  green_speed text,
  played_at timestamptz NOT NULL DEFAULT now(),
  challenge_started_at timestamptz,
  challenge_completed_at timestamptz,
  duration_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_edited_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenge_results TO authenticated;
GRANT ALL ON public.challenge_results TO service_role;

ALTER TABLE public.challenge_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own challenge results"
  ON public.challenge_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own challenge results"
  ON public.challenge_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own challenge results"
  ON public.challenge_results FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own challenge results"
  ON public.challenge_results FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all challenge results"
  ON public.challenge_results FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_challenge_results_user ON public.challenge_results(user_id, played_at DESC);
CREATE INDEX idx_challenge_results_challenge ON public.challenge_results(challenge_id, score DESC);

CREATE TRIGGER update_challenge_results_updated_at
  BEFORE UPDATE ON public.challenge_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Seed: Keep It Up
INSERT INTO public.challenges (slug, name, category, description, setup, rules, config, score_label, sort_order)
VALUES (
  'keep-it-up',
  'Keep It Up',
  'Draw',
  'Keep your bowls alive for as many ends as possible by drawing level with or behind the jack.',
  E'Place the jack on the 2 metre mark.\nPlace the mat anywhere on the rink.\nStart with 4 bowls.\nThe aim is to keep bowls alive for as many ends as possible.',
  '[
    "A bowl survives if it finishes level with the jack or behind the jack.",
    "A bowl is lost if it finishes in front of the jack or enters the ditch.",
    "At the end of each end, lost bowls are removed.",
    "Surviving bowls carry forward to the next end.",
    "If a bowl touches the jack, it restores one previously lost bowl.",
    "Maximum bowls available is 4.",
    "Game ends when no bowls remain."
  ]'::jsonb,
  '{"start_bowls": 4, "max_bowls": 4, "score_unit": "ends"}'::jsonb,
  'Ends Survived',
  1
);
