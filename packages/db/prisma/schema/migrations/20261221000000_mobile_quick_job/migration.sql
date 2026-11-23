-- The phone's change queue gains quick jobs raised from a scanned asset.
ALTER TABLE mobile_mutation DROP CONSTRAINT mobile_mutation_kind_valid;
ALTER TABLE mobile_mutation
  ADD CONSTRAINT mobile_mutation_kind_valid CHECK (kind IN ('status', 'note', 'checklist_answer', 'meter_reading', 'time', 'quick_job'));
