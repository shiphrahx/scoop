-- The day a weekly target actually started being eaten.
--
-- Targets are keyed by the Monday of the week they belong to, and the review
-- counted how long one had been in force in whole weeks. But targets do change
-- mid-week: a calibration hold graduates on its own timestamp, and editing the
-- profile recomputes the week already in force. A target that only started on
-- the Thursday was still counted as a full week, so the two-week wait before
-- the coach adjusts anything could fire after eleven days.
--
-- That wait is physiological — roughly how long the body takes to show whether
-- it is really adapting rather than shedding water — so it has to be counted in
-- real days on the food, not in calendar weeks the row happens to touch.
--
-- Nullable, and backfilled to week_start: rows written before this column
-- existed did all start on their Monday, because writing this week's target
-- mid-week is what this change is here to measure.
alter table public.daily_targets
  add column if not exists effective_from date;

update public.daily_targets
   set effective_from = week_start
 where effective_from is null;
