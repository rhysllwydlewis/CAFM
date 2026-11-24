-- A change from the phone is claimed (outcome "pending") before it runs, so two requests with the same key
-- cannot both run it. The unique index on (tenant, member, key) makes the claim safe. No new column or table,
-- and the table's RLS policies are unchanged (read, insert, update and delete are already separate policies).
ALTER TABLE mobile_mutation DROP CONSTRAINT mobile_mutation_outcome_valid;
ALTER TABLE mobile_mutation
  ADD CONSTRAINT mobile_mutation_outcome_valid CHECK (outcome IN ('pending', 'applied', 'rejected'));
