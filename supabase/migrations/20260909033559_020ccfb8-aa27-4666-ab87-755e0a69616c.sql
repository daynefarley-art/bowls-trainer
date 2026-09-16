CREATE TABLE public.training_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekly_minutes integer,
  min_training_days integer,
  reminders_enabled boolean NOT NULL DEFAULT false,
  focus_areas text[] NOT NULL DEFAULT '{}',
  playing_position text,
  effective_from timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX training_goals_user_effective_idx ON public.training_goals (user_id, effective_from DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_goals TO authenticated;
GRANT ALL ON public.training_goals TO service_role;

ALTER TABLE public.training_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own training goals"
ON public.training_goals FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_training_goals_updated_at
BEFORE UPDATE ON public.training_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();