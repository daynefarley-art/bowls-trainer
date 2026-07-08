UPDATE public.drills SET
  name = 'Length Control Drill',
  description = 'Adjust your weight accurately between four target lengths — short, medium, long and ditch. Deliver 8 bowls across 2 ends and score each bowl by how close it finishes (5 within half a mat, 3 within one mat, 1 within two mats, 0 outside).',
  category = 'Weight Control',
  max_score = 40,
  min_score = 0,
  bowls_per_end = 8,
  setup = 'Place four target jacks on the centre line: Short (minimum jack mark), Medium, Long (2 metre mark) and Ditch (just short of the ditch). Play 2 ends of 4 bowls — Bowl 1 to Short, Bowl 2 to Medium, Bowl 3 to Long, Bowl 4 to Ditch. Repeat the same sequence for End 2. Measure each bowl from its target jack and tally it in the appropriate scoring zone.',
  scoring_config = '{"categories":[{"key":"half_mat","label":"Half Mat","points":5},{"key":"one_mat","label":"One Mat","points":3},{"key":"two_mats","label":"Two Mats","points":1},{"key":"outside_two_mats","label":"Outside Two Mats","points":0}]}'::jsonb
WHERE slug = 'weight-control-ladder';

UPDATE public.results SET
  drill_name = 'Length Control Drill',
  max_score = 40,
  min_score = 0,
  percentage = ROUND((score::numeric / NULLIF(40, 0)) * 100, 2)
WHERE drill_id IN (SELECT id FROM public.drills WHERE slug = 'weight-control-ladder');