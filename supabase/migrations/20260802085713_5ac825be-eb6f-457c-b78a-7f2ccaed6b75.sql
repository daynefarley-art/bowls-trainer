-- Drill instruction text: 10 -> 8 (runtime delivers 8)
UPDATE public.drills SET
  description = 'Roll 8 jacks into a target zone to test delivery precision.',
  setup = 'Mark a perfect zone and a wider acceptable zone at standard jack length. Roll 8 jacks. Score each as perfect, acceptable, or miss.'
WHERE slug = 'jack-delivery-accuracy';

UPDATE public.drills SET
  description = 'Drive at a target bowl 8 times to test full-weight accuracy.',
  setup = 'Place a single target bowl on the centre line at jack length. Take 8 drives with full weight. Score each as full hit, movement, or miss.'
WHERE slug = 'drive-accuracy';

UPDATE public.drills SET
  setup = 'A target bowl is positioned near the jack. Play 8 controlled running shots through the head.'
WHERE slug = 'running-shot-drill';

-- SLiMeD: rules text still described the retired 32-bowl / max-64 format
UPDATE public.challenges SET
  score_label = 'Total Score / 80',
  rules = '["Play 4 ends of 4 bowls — 16 bowls in total.", "Each end has one target length: End 1 Short, End 2 Long, End 3 Medium, End 4 Ditch.", "Hands alternate by end — End 1 forehand, End 2 backhand, End 3 forehand, End 4 backhand.", "Score each bowl: within half a mat = 5, within one mat = 3, within two mats = 1, outside two mats = 0.", "Maximum 20 points per end. Maximum 80 points for the challenge.", "Visual Scoring: tap where the bowl finished — the score is calculated automatically.", "Challenge scores do not affect your BSI."]'::jsonb
WHERE slug = 'slimed';

-- Drive Then Draw: label said /40 but the challenge maximum is 80
UPDATE public.challenges SET score_label = 'Total Score / 80' WHERE slug = 'drive-then-draw';

-- Jack in the Ditch: include the drive channel mat setup instruction
UPDATE public.challenges SET
  setup = 'Bring the mat up the rink.
Deliver or place the jack as close as possible to the 2 metre mark.
Place a mat directly behind the jack, positioned lengthwise in line with the delivery. This mat becomes the drive channel.
Set up the Drive Gate on the rink.
Each end uses 4 bowls.
Play 5 ends.'
WHERE slug = 'jack-in-ditch';

-- Traffic Jam: 4 ends, single obstacle mat, maximum 16
UPDATE public.challenges SET
  score_label = 'Total Score / 16',
  config = config || '{"ends": 4, "max_score": 16}'::jsonb,
  description = 'Bowls 1 and 2 are played to the front jack. Bowls 3 and 4 are played to the centre jack. Score 1 point for every bowl that finishes within one mat length of its assigned jack without touching the obstacle mat. Play 4 ends.',
  rules = '["Bowls 1 and 2 are played to the FRONT jack.", "Bowls 3 and 4 are played to the CENTRE jack.", "Score 1 point for each bowl that finishes within one mat length of its assigned jack AND does not touch the obstacle mat.", "Score 0 points if the bowl finishes outside one mat length of its assigned jack or touches the obstacle mat.", "Maximum 4 points per end. Maximum 16 points for the challenge."]'::jsonb,
  setup = 'Place the front jack on the centre line, just beyond the minimum length.
Place the centre (target) jack further up the rink, also on the centre line.
Place one obstacle mat between the front jack and the centre jack.
Player delivers 4 bowls per end for 4 ends (16 bowls total).'
WHERE slug = 'traffic-jam';

UPDATE public.challenge_badge_thresholds
  SET bronze = 6, silver = 9, gold = 12, platinum = 15, updated_at = now()
WHERE challenge_slug = 'traffic-jam';

UPDATE public.challenge_badge_thresholds
  SET bronze = 25, silver = 40, gold = 55, platinum = 70, updated_at = now()
WHERE challenge_slug = 'drive-then-draw';