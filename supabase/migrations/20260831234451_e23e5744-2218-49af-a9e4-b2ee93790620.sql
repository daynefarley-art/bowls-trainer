DO $$
DECLARE
  quality jsonb := jsonb_build_object(
    'weight-control-ladder', jsonb_build_object('half_mat',95,'one_mat',82,'two_mats',60,'outside_two_mats',0,'hit',82,'close',60,'miss',0),
    'jack-delivery-accuracy', jsonb_build_object('perfect',95,'acceptable',70,'miss',0),
    'drive-accuracy',        jsonb_build_object('full_hit',100,'movement',80,'channel',55,'miss',0),
    'upshot-drill',          jsonb_build_object('remove_hold',100,'remove',82,'contact',62,'target_zone',40,'miss',0),
    'running-shot-drill',    jsonb_build_object('move_remain',100,'full_contact',80,'disturb',60,'miss',0)
  );
  gammas jsonb := jsonb_build_object(
    'weight-control-ladder', 1.0,
    'jack-delivery-accuracy', 0.95,
    'drive-accuracy', 0.72,
    'upshot-drill', 0.72,
    'running-shot-drill', 0.75,
    'jack-in-ditch', 0.75
  );
  r record;
  v_bowls numeric;
  v_total numeric;
  v_raw numeric;
  v_gamma numeric;
  v_new numeric;
BEGIN
  FOR r IN
    SELECT res.id, d.slug, res.breakdown, res.percentage, res.bsi
    FROM public.results res
    JOIN public.drills d ON d.id = res.drill_id
    WHERE d.slug IN (
      'drive-accuracy','upshot-drill','running-shot-drill',
      'jack-delivery-accuracy','jack-in-ditch','weight-control-ladder'
    )
  LOOP
    v_gamma := COALESCE((gammas ->> r.slug)::numeric, 1.0);
    v_bowls := 0;
    v_total := 0;

    IF quality ? r.slug AND jsonb_typeof(r.breakdown) = 'object' THEN
      SELECT
        COALESCE(SUM((r.breakdown ->> k)::numeric), 0),
        COALESCE(SUM((r.breakdown ->> k)::numeric * (quality -> r.slug ->> k)::numeric), 0)
      INTO v_bowls, v_total
      FROM jsonb_object_keys(quality -> r.slug) AS k
      WHERE r.breakdown ? k
        AND jsonb_typeof(r.breakdown -> k) = 'number';
    END IF;

    IF v_bowls > 0 THEN
      v_raw := v_total / v_bowls;
    ELSE
      v_raw := GREATEST(0, LEAST(100, COALESCE(r.percentage, r.bsi, 0)));
    END IF;

    v_new := ROUND(GREATEST(0, LEAST(100, 100 * power(v_raw / 100.0, v_gamma)))::numeric, 1);

    UPDATE public.results SET bsi = v_new WHERE id = r.id;
  END LOOP;
END $$;