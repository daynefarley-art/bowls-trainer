
UPDATE public.drills
SET setup = E'An opposition bowl is positioned holding shot in front of the jack. Play 8 bowls aiming to remove the shot bowl and hold shot.\n\nSet up a target weight zone for a correctly weighted near-miss: place one mat about one mat length beyond the target bowl, and a second mat about two mat lengths beyond it. The area between those two mats is your target zone. If an upshot misses the bowl but finishes more than one mat yet less than two mats past it, score it in the target zone. You can adjust the zone spacing to suit the practice you are doing.'
WHERE slug = 'upshot-drill';

UPDATE public.drills
SET setup = E'Place a single target bowl on the centre line at jack length.\n\nSet a target channel by placing a mat directly behind the target bowl, lengthwise (same orientation as a bowls delivery mat). The objective is to drive over the mat. Take 8 drives with full weight. Score each as full hit, jack moved or deflected, through the target channel (missed jack), or miss.'
WHERE slug = 'drive-accuracy';
