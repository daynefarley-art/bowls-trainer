
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  club TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE TABLE public.drills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  max_score INT NOT NULL,
  min_score INT NOT NULL,
  bowls_per_end INT NOT NULL DEFAULT 8,
  scoring_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.drills TO authenticated, anon;
GRANT ALL ON public.drills TO service_role;
ALTER TABLE public.drills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drills are viewable by everyone" ON public.drills FOR SELECT USING (true);

CREATE TABLE public.results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drill_id UUID NOT NULL REFERENCES public.drills(id) ON DELETE CASCADE,
  score INT NOT NULL,
  bsi NUMERIC(5,2) NOT NULL,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  conditions TEXT,
  green_speed TEXT,
  location TEXT,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.results TO authenticated;
GRANT ALL ON public.results TO service_role;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own results" ON public.results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own results" ON public.results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own results" ON public.results FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own results" ON public.results FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX results_user_played_idx ON public.results(user_id, played_at DESC);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
