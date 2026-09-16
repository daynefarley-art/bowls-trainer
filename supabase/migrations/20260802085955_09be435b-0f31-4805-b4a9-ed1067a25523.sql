UPDATE public.drills
SET bowls_per_end = 4,
    max_score = 80,
    scoring_config = jsonb_set(scoring_config, '{ends}', '4'::jsonb, true),
    description = 'Adjust your weight accurately between four target lengths — short, medium, long and ditch — across four ends.',
    setup = 'Place four target jacks on the centre line: Short (minimum jack mark), Medium, Long (2 metre mark) and Ditch (just short of the ditch). Play 4 ends of 4 bowls (16 bowls total). Bowls 1 & 2 forehand, bowls 3 & 4 backhand.'
WHERE slug = 'weight-control-ladder';

UPDATE public.challenges
SET setup = 'Play 4 ends of 4 bowls (16 bowls total). Each end alternates Drive, Draw, Drive, Draw. Hands swap each end so both forehand and backhand get equal work.'
WHERE slug = 'drive-then-draw';