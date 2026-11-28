-- An hourly labour rate is capped at £400,000 so a whole day of time (1,440 minutes) never costs
-- more than a job can hold (£10 million). The old ceiling, £1,000,000 an hour, could make a cost
-- too large for the column. NOT VALID checks every new or changed row without failing the
-- migration on a rate or recorded entry that already exists above the new ceiling.
ALTER TABLE labour_rate DROP CONSTRAINT labour_rate_amount_valid;
ALTER TABLE labour_rate
  ADD CONSTRAINT labour_rate_amount_valid CHECK (rate_minor BETWEEN 0 AND 40000000) NOT VALID;

ALTER TABLE work_order_time DROP CONSTRAINT work_order_time_rate_valid;
ALTER TABLE work_order_time
  ADD CONSTRAINT work_order_time_rate_valid CHECK (rate_minor IS NULL OR rate_minor BETWEEN 0 AND 40000000) NOT VALID;
