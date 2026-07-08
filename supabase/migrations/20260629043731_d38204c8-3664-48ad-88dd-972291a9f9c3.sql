CREATE POLICY "Admins view all sessions" ON public.training_sessions
FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));