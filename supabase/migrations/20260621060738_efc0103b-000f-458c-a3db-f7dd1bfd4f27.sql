
UPDATE public.drills SET
  max_score = 40,
  min_score = 0,
  bowls_per_end = 8,
  description = 'Deliver 8 bowls to the jack. Score each bowl by how close it finishes — 5 for within half a mat, 3 within one mat, 1 within two mats, 0 outside two mats.',
  setup = 'Place the jack at a standard length on a normal green. Deliver 8 bowls in total (alternating hands or all on your chosen hand). Measure each bowl from the jack and tally it in the appropriate scoring zone. The objective is to finish as many bowls as possible within half a mat of the jack.',
  scoring_config = '{"categories":[{"key":"half_mat","label":"Half Mat","points":5},{"key":"one_mat","label":"One Mat","points":3},{"key":"two_mats","label":"Two Mats","points":1},{"key":"outside_two_mats","label":"Outside Two Mats","points":0}]}'::jsonb
WHERE slug = '8-bowl-draw-test';

UPDATE public.drills SET
  max_score = 40,
  min_score = 0,
  bowls_per_end = 8,
  description = 'Deliver 8 forehand bowls to the jack. Score each bowl by how close it finishes — 5 for within half a mat, 3 within one mat, 1 within two mats, 0 outside two mats.',
  setup = 'Set the jack at a comfortable length. Deliver 8 bowls on your forehand only. Measure each bowl from the jack and tally it in the appropriate scoring zone. The objective is to finish as many bowls as possible within half a mat of the jack.',
  scoring_config = '{"categories":[{"key":"half_mat","label":"Half Mat","points":5},{"key":"one_mat","label":"One Mat","points":3},{"key":"two_mats","label":"Two Mats","points":1},{"key":"outside_two_mats","label":"Outside Two Mats","points":0}]}'::jsonb
WHERE slug = 'forehand-draw-test';

UPDATE public.drills SET
  max_score = 40,
  min_score = 0,
  bowls_per_end = 8,
  description = 'Deliver 8 backhand bowls to the jack. Score each bowl by how close it finishes — 5 for within half a mat, 3 within one mat, 1 within two mats, 0 outside two mats.',
  setup = 'Set the jack at a comfortable length. Deliver 8 bowls on your backhand only. Measure each bowl from the jack and tally it in the appropriate scoring zone. The objective is to finish as many bowls as possible within half a mat of the jack.',
  scoring_config = '{"categories":[{"key":"half_mat","label":"Half Mat","points":5},{"key":"one_mat","label":"One Mat","points":3},{"key":"two_mats","label":"Two Mats","points":1},{"key":"outside_two_mats","label":"Outside Two Mats","points":0}]}'::jsonb
WHERE slug = 'backhand-draw-test';
