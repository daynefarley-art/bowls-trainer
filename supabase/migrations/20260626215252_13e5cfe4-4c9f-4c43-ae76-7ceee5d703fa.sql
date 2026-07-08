UPDATE public.challenges
SET config = jsonb_set(jsonb_set(config::jsonb, '{bowls_per_end}', '4'::jsonb, false), '{max_score}', '80'::jsonb, false),
    description = 'Drive through a target channel, then draw to a new jack position — alternating drive and draw across four-bowl ends, with hands swapping each end.',
    setup = E'Drive Channel: Place a mat at short-to-medium length, lengthwise (same orientation as a bowls delivery mat). The objective is to drive over the mat.\n\nDraw Target: Place a jack further up the rink, off centre. This represents the new jack position after the drive.\n\nFormat: 4 ends × 4 bowls (16 bowls total). Each end alternates Drive then Draw, twice.\n\nHands alternate every end so both forehand and backhand get equal practice:\n- Ends 1 & 3: Drive Forehand, Draw Backhand, Drive Forehand, Draw Backhand\n- Ends 2 & 4: Drive Backhand, Draw Forehand, Drive Backhand, Draw Forehand',
    rules = to_jsonb(ARRAY[
      'Each end has 4 bowls in order: Drive, Draw, Drive, Draw.',
      'Hands alternate every end: Ends 1 & 3 — Drive Forehand and Draw Backhand. Ends 2 & 4 — Drive Backhand and Draw Forehand.',
      'Drive scoring: 5 points if the bowl passes through or strikes the Drive Channel mat; 3 points within one mat length; 0 points beyond one mat length.',
      'Draw scoring: 5 points within half a mat of the jack; 3 points within one mat; 1 point within two mats; 0 points beyond two mats.',
      'Maximum 20 points per end. Maximum 80 points for the challenge.',
      'Challenge scores do not contribute to your BSI.'
    ])
WHERE slug = 'drive-then-draw';