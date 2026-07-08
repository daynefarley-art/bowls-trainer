GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_access TO authenticated;
GRANT ALL ON public.coach_access TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;