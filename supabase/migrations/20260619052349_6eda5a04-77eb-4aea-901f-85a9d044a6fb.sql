
-- Extend drills with category, setup, weighting; seed new drills
ALTER TABLE public.drills
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS setup TEXT,
  ADD COLUMN IF NOT EXISTS weight NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- Extend results with snapshot fields so the row stands alone
ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS drill_name TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS max_score INT,
  ADD COLUMN IF NOT EXISTS min_score INT,
  ADD COLUMN IF NOT EXISTS percentage NUMERIC(5,2);

-- Update existing 8 Bowl Draw drill
UPDATE public.drills SET
  category = 'Draw Accuracy',
  weight = 0.40,
  sort_order = 1,
  setup = 'Place the jack at a standard length on a normal green. Deliver 8 bowls in total (alternating hands or all on chosen hand). Measure each bowl from the jack and tally the result in each scoring zone.'
WHERE slug = '8-bowl-draw-test';

-- Insert the new drills
INSERT INTO public.drills (slug, name, description, category, max_score, min_score, bowls_per_end, weight, sort_order, setup, scoring_config) VALUES
('forehand-draw-test',
 'Forehand Draw Test',
 'Test your forehand draw line and weight consistency across 8 bowls.',
 'Draw Accuracy', 40, -16, 8, 0.15, 2,
 'Set the jack at a comfortable length. Deliver 8 bowls on your forehand only. Tally each bowl in the appropriate zone based on distance from the jack.',
 '{"categories":[{"key":"toucher","label":"Toucher","points":5},{"key":"within_300","label":"Within 300mm","points":3},{"key":"within_600","label":"Within 600mm","points":2},{"key":"within_1m","label":"Within 1m","points":1},{"key":"within_2m","label":"Within 2m","points":0},{"key":"over_2m","label":"Over 2m","points":-1},{"key":"ditch","label":"Ditch","points":-2}]}'::jsonb
),
('backhand-draw-test',
 'Backhand Draw Test',
 'Test your backhand draw line and weight consistency across 8 bowls.',
 'Draw Accuracy', 40, -16, 8, 0.15, 3,
 'Set the jack at a comfortable length. Deliver 8 bowls on your backhand only. Tally each bowl in the appropriate zone based on distance from the jack.',
 '{"categories":[{"key":"toucher","label":"Toucher","points":5},{"key":"within_300","label":"Within 300mm","points":3},{"key":"within_600","label":"Within 600mm","points":2},{"key":"within_1m","label":"Within 1m","points":1},{"key":"within_2m","label":"Within 2m","points":0},{"key":"over_2m","label":"Over 2m","points":-1},{"key":"ditch","label":"Ditch","points":-2}]}'::jsonb
),
('weight-control-ladder',
 'Weight Control Ladder',
 'Deliver 3 short, 3 medium and 3 long bowls to test weight control across the rink.',
 'Weight Control', 27, 0, 9, 0.15, 4,
 'Mark three target zones: short, medium and long. Deliver 3 bowls at each length (9 in total). Score each delivery as hit zone, close, or miss.',
 '{"categories":[{"key":"hit","label":"Hit zone","points":3},{"key":"close","label":"Close","points":1},{"key":"miss","label":"Miss","points":0}]}'::jsonb
),
('jack-delivery-accuracy',
 'Jack Delivery Accuracy',
 'Roll 10 jacks into a target zone to test delivery precision.',
 'Jack Delivery', 30, 0, 10, 0.05, 5,
 'Mark a perfect zone and a wider acceptable zone at standard jack length. Roll 10 jacks. Score each as perfect, acceptable, or miss.',
 '{"categories":[{"key":"perfect","label":"Perfect zone","points":3},{"key":"acceptable","label":"Acceptable","points":1},{"key":"miss","label":"Miss","points":0}]}'::jsonb
),
('drive-accuracy',
 'Drive Accuracy',
 'Drive at a target bowl 10 times to test full-weight accuracy.',
 'Drive', 50, 0, 10, 0.10, 6,
 'Place a single target bowl on the centre line at jack length. Take 10 drives with full weight. Score each as full hit, movement, or miss.',
 '{"categories":[{"key":"full_hit","label":"Full hit","points":5},{"key":"movement","label":"Movement","points":2},{"key":"miss","label":"Miss","points":0}]}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Backfill drill_name / category / max_score / min_score / percentage for existing results
UPDATE public.results r SET
  drill_name = d.name,
  category = d.category,
  max_score = d.max_score,
  min_score = d.min_score,
  percentage = ROUND(((r.score - d.min_score)::numeric / NULLIF((d.max_score - d.min_score), 0)) * 100, 2)
FROM public.drills d
WHERE r.drill_id = d.id AND r.drill_name IS NULL;
