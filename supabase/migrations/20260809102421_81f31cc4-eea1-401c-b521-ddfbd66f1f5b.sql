CREATE TYPE public.trainer_session_status AS ENUM ('planned','in_progress','completed','abandoned');
CREATE TYPE public.trainer_block_status AS ENUM ('pending','active','completed','skipped');

-- ── exercise_variants ───────────────────────────────────────────────────────
CREATE TABLE public.exercise_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  exercise_id uuid NOT NULL REFERENCES public.drills(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  difficulty integer NOT NULL DEFAULT 3,
  target_skill text NOT NULL,
  setup_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  scoring_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exercise_variants TO authenticated;
GRANT ALL ON public.exercise_variants TO service_role;
ALTER TABLE public.exercise_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Variants readable by signed-in users"
  ON public.exercise_variants FOR SELECT TO authenticated USING (true);
CREATE TRIGGER exercise_variants_updated_at BEFORE UPDATE ON public.exercise_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_exercise_variants_exercise ON public.exercise_variants(exercise_id) WHERE active;

-- ── trainer_sessions ────────────────────────────────────────────────────────
CREATE TABLE public.trainer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  status public.trainer_session_status NOT NULL DEFAULT 'planned',
  focus_areas text[] NOT NULL DEFAULT ARRAY[]::text[],
  planned_minutes integer NOT NULL DEFAULT 30,
  current_block integer NOT NULL DEFAULT 0,
  total_blocks integer NOT NULL DEFAULT 0,
  completed_blocks integer NOT NULL DEFAULT 0,
  training_session_id uuid REFERENCES public.training_sessions(id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainer_sessions TO authenticated;
GRANT ALL ON public.trainer_sessions TO service_role;
ALTER TABLE public.trainer_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own trainer sessions" ON public.trainer_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trainer_sessions_updated_at BEFORE UPDATE ON public.trainer_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_trainer_sessions_user ON public.trainer_sessions(user_id, generated_at DESC);

-- ── trainer_session_blocks ──────────────────────────────────────────────────
CREATE TABLE public.trainer_session_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.trainer_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  block_type text NOT NULL DEFAULT 'focus',
  exercise_id uuid REFERENCES public.drills(id) ON DELETE SET NULL,
  exercise_slug text,
  exercise_variant_id uuid REFERENCES public.exercise_variants(id) ON DELETE SET NULL,
  variant_slug text,
  title text NOT NULL,
  target_skill text,
  reason text,
  planned_minutes integer NOT NULL DEFAULT 6,
  planned_ends integer,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.trainer_block_status NOT NULL DEFAULT 'pending',
  result_id uuid REFERENCES public.results(id) ON DELETE SET NULL,
  score numeric,
  percentage numeric,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, sequence)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainer_session_blocks TO authenticated;
GRANT ALL ON public.trainer_session_blocks TO service_role;
ALTER TABLE public.trainer_session_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own trainer blocks" ON public.trainer_session_blocks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trainer_session_blocks_updated_at BEFORE UPDATE ON public.trainer_session_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_trainer_blocks_session ON public.trainer_session_blocks(session_id, sequence);
CREATE INDEX idx_trainer_blocks_user_variant ON public.trainer_session_blocks(user_id, exercise_variant_id, created_at DESC);

-- ── seed variant catalogue (references existing drills by slug) ─────────────
INSERT INTO public.exercise_variants (slug, exercise_id, name, description, difficulty, target_skill, setup_parameters, tags, sort_order)
SELECT v.slug, d.id, v.name, v.description, v.difficulty, v.target_skill, v.setup::jsonb, v.tags::text[], v.sort_order
FROM (VALUES
  ('short-draw-forehand','short-draw','Short Draw — Forehand Only','All four bowls on the forehand at short length.',2,'draw','{"hand":"forehand","length":"short","ends":4}','{"hand-forehand","short"}',10),
  ('short-draw-backhand','short-draw','Short Draw — Backhand Only','All four bowls on the backhand at short length.',3,'draw','{"hand":"backhand","length":"short","ends":4}','{"hand-backhand","short"}',20),
  ('short-draw-alternate','short-draw','Short Draw — Alternate Hands','Switch hand every bowl to build adaptability.',4,'draw','{"hand":"alternate","length":"short","ends":4}','{"hand-alternate","short"}',30),
  ('medium-draw-forehand','medium-draw','Medium Draw — Forehand Only','Four bowls forehand at medium length.',2,'draw','{"hand":"forehand","length":"medium","ends":4}','{"hand-forehand","medium"}',40),
  ('medium-draw-backhand','medium-draw','Medium Draw — Backhand Only','Four bowls backhand at medium length.',3,'draw','{"hand":"backhand","length":"medium","ends":4}','{"hand-backhand","medium"}',50),
  ('medium-draw-alternate','medium-draw','Medium Draw — Alternate Hands','Alternate hands each bowl at medium length.',4,'draw','{"hand":"alternate","length":"medium","ends":4}','{"hand-alternate","medium"}',60),
  ('long-draw-forehand','long-draw','Long Draw — Forehand Only','Full-length draw on the forehand.',3,'draw','{"hand":"forehand","length":"long","ends":4}','{"hand-forehand","long"}',70),
  ('long-draw-backhand','long-draw','Long Draw — Backhand Only','Full-length draw on the backhand.',4,'draw','{"hand":"backhand","length":"long","ends":4}','{"hand-backhand","long"}',80),
  ('long-draw-alternate','long-draw','Long Draw — Alternate Hands','Alternate hands at full length.',5,'draw','{"hand":"alternate","length":"long","ends":4}','{"hand-alternate","long"}',90),
  ('length-ladder-up','weight-control-ladder','Length Ladder — Short to Long','Work up the ladder from short to full length.',3,'weight','{"progression":"ascending"}','{"weight","ladder"}',100),
  ('length-ladder-down','weight-control-ladder','Length Ladder — Long to Short','Work back down the ladder from full length.',3,'weight','{"progression":"descending"}','{"weight","ladder"}',110),
  ('length-ladder-random','weight-control-ladder','Length Ladder — Random Call','Change length unpredictably each end.',5,'weight','{"progression":"random"}','{"weight","ladder"}',120),
  ('jack-delivery-standard','jack-delivery-accuracy','Jack Delivery — Mixed Lengths','Deliver jacks to a range of called lengths.',2,'jack','{"length":"mixed"}','{"jack"}',130),
  ('jack-delivery-long','jack-delivery-accuracy','Jack Delivery — Full Length','Every jack to full length.',4,'jack','{"length":"long"}','{"jack","long"}',140),
  ('drive-accuracy-standard','drive-accuracy','Drive Accuracy — Standard Target','Drive at the standard target head.',3,'driving','{"target":"standard"}','{"driving"}',150),
  ('drive-accuracy-narrow','drive-accuracy','Drive Accuracy — Narrow Target','Tighter target for a sharper line.',5,'driving','{"target":"narrow"}','{"driving"}',160),
  ('upshot-forehand','upshot-drill','Upshot — Forehand','Play the upshot on the forehand.',3,'upshots','{"hand":"forehand"}','{"upshots","hand-forehand"}',170),
  ('upshot-backhand','upshot-drill','Upshot — Backhand','Play the upshot on the backhand.',4,'upshots','{"hand":"backhand"}','{"upshots","hand-backhand"}',180),
  ('running-shot-yard','running-shot-drill','Running Shot — Yard On','Controlled yard-on weight.',3,'running','{"weight":"yard-on"}','{"running"}',190),
  ('running-shot-heavy','running-shot-drill','Running Shot — Heavy','Firmer running weight.',5,'running','{"weight":"heavy"}','{"running"}',200),
  ('jack-ditch-standard','jack-in-ditch','Jack in the Ditch — Standard','Standard ditching practice.',3,'driving','{"target":"standard"}','{"driving"}',210)
) AS v(slug, drill_slug, name, description, difficulty, target_skill, setup, tags, sort_order)
JOIN public.drills d ON d.slug = v.drill_slug;