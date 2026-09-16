UPDATE public.drills
SET scoring_config = jsonb_build_object(
  'categories', jsonb_build_array(
    jsonb_build_object('key','remove_hold','label','Remove bowl & hold shot','points',5),
    jsonb_build_object('key','remove','label','Remove bowl, not shot','points',3),
    jsonb_build_object('key','contact','label','Contact bowl','points',2),
    jsonb_build_object('key','target_zone','label','Finishes in target zone','points',1,
      'note','Target zone: You set it. As a general rule, the bowl should finish more than one mat but less than two mats past the target.'),
    jsonb_build_object('key','miss','label','Miss / outside target zone','points',0)
  )
)
WHERE slug = 'upshot-drill';

UPDATE public.drills
SET scoring_config = jsonb_build_object(
  'categories', jsonb_build_array(
    jsonb_build_object('key','full_hit','label','Full hit','points',5),
    jsonb_build_object('key','movement','label','Jack moved or deflected','points',3),
    jsonb_build_object('key','channel','label','Through target channel (missed jack)','points',1,
      'note','Target channel: the mat placed directly behind the jack — same idea as the Drive Then Draw drive channel.'),
    jsonb_build_object('key','miss','label','Miss jack and channel','points',0)
  )
)
WHERE slug = 'drive-accuracy';