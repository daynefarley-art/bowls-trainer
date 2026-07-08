
-- User self-service action audit log
CREATE TABLE IF NOT EXISTS public.user_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_email text,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.user_action_log TO authenticated;
GRANT ALL ON public.user_action_log TO service_role;

ALTER TABLE public.user_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own action log" ON public.user_action_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all action logs" ON public.user_action_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Erase the calling user's training history
CREATE OR REPLACE FUNCTION public.erase_my_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  DELETE FROM public.results WHERE user_id = v_uid;
  DELETE FROM public.challenge_results WHERE user_id = v_uid;
  DELETE FROM public.training_sessions WHERE user_id = v_uid;
  DELETE FROM public.coach_notes WHERE player_id = v_uid;

  INSERT INTO public.user_action_log (user_id, account_email, action, details)
    VALUES (v_uid, v_email, 'ERASE_HISTORY', jsonb_build_object('at', now()));
END;
$$;

GRANT EXECUTE ON FUNCTION public.erase_my_history() TO authenticated;
