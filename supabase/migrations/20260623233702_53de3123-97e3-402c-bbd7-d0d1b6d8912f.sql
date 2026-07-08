UPDATE public.challenges
SET config = jsonb_set(jsonb_set(config::jsonb, '{ends}', '8'::jsonb, false), '{bowls_per_end}', '4'::jsonb, false)
WHERE slug = 'slimed';

UPDATE public.challenges
SET description = 'Drive through a target channel, then draw to a new jack position — simulating a head reset after a drive.',
    setup = E'Drive Channel: place a mat at short-to-medium length to act as the drive channel. The objective is to drive over the mat.\nDraw Target: place a jack further up the rink, off centre. This represents the new jack position after the drive.\nIf available, set up two rinks side by side.\nFormat: 4 ends, 2 bowls per end (8 bowls total).\nEach end: Bowl 1 = Drive shot at the Drive Channel; Bowl 2 = Draw shot to the Draw Target.'
WHERE slug = 'drive-then-draw';