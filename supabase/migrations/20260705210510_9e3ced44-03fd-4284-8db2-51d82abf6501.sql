
WITH targets AS (
  SELECT id, breakdown
  FROM public.challenge_results
  WHERE challenge_name = 'Switch 32'
    AND (breakdown->>'type') = 'fixed-ends'
),
bowls AS (
  SELECT
    t.id,
    (e.value->>'end_number')::int AS end_number,
    bv.value->>'band' AS band
  FROM targets t
  CROSS JOIN LATERAL jsonb_array_elements(t.breakdown->'ends') AS e(value)
  CROSS JOIN LATERAL jsonb_array_elements(e.value->'bowls_visual') AS bv(value)
),
scored_bowls AS (
  SELECT id, end_number,
    CASE band WHEN 'half' THEN 5 WHEN 'one' THEN 3 WHEN 'two' THEN 1 ELSE 0 END AS pts
  FROM bowls
),
end_totals AS (
  SELECT id, end_number, SUM(pts) AS end_score
  FROM scored_bowls
  GROUP BY id, end_number
),
new_ends AS (
  SELECT
    t.id,
    jsonb_agg(
      jsonb_build_object(
        'end_number', (e.value->>'end_number')::int,
        'target', COALESCE(e.value->>'target', 'M'),
        'bowls', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'bowl_number', ((e.value->>'end_number')::int - 1) * 4 + (bv.ord),
              'end_number', (e.value->>'end_number')::int,
              'bowl_in_end', bv.ord,
              'hand', COALESCE(bv.value->>'hand', CASE WHEN bv.ord % 2 = 1 THEN 'forehand' ELSE 'backhand' END),
              'target', COALESCE(bv.value->>'target', e.value->>'target', 'M'),
              'score', CASE bv.value->>'band' WHEN 'half' THEN 5 WHEN 'one' THEN 3 WHEN 'two' THEN 1 ELSE 0 END,
              'x', (bv.value->>'x')::numeric,
              'y', (bv.value->>'y')::numeric,
              'band', bv.value->>'band'
            )
            ORDER BY bv.ord
          )
          FROM jsonb_array_elements(e.value->'bowls_visual') WITH ORDINALITY bv(value, ord)
        ),
        'end_score', et.end_score
      )
      ORDER BY (e.value->>'end_number')::int
    ) AS ends_json,
    SUM(et.end_score) AS total_score,
    jsonb_agg(et.end_score ORDER BY et.end_number) AS end_scores
  FROM targets t
  CROSS JOIN LATERAL jsonb_array_elements(t.breakdown->'ends') AS e(value)
  JOIN end_totals et
    ON et.id = t.id AND et.end_number = (e.value->>'end_number')::int
  GROUP BY t.id
)
UPDATE public.challenge_results cr
SET
  score = ne.total_score,
  breakdown = jsonb_build_object(
    'type', 'switch-32',
    'mode', COALESCE(cr.breakdown->>'scoring_mode', 'visual'),
    'ends', ne.ends_json,
    'total_score', ne.total_score,
    'max_score', 160,
    'end_scores', ne.end_scores,
    'by_length', jsonb_build_object(
      'S', jsonb_build_object('score', 0, 'max', 0),
      'M', jsonb_build_object('score', 0, 'max', 0),
      'L', jsonb_build_object('score', 0, 'max', 0)
    ),
    'by_hand', jsonb_build_object(
      'forehand', jsonb_build_object('score', 0, 'max', 0),
      'backhand', jsonb_build_object('score', 0, 'max', 0)
    ),
    'migrated_from', 'fixed-ends'
  )
FROM new_ends ne
WHERE cr.id = ne.id;
