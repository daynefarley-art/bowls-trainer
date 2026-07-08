INSERT INTO public.user_roles (user_id, role)
VALUES ('4f72e0bd-4068-4da9-8615-2b1d59f7d277', 'admin'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;