-- Team names are unique whatever their case ("North Region" and "north region" are one team).
-- Teams that already differ only by case keep their oldest and get a suffix on the later ones, so
-- the index can be built and nothing is lost.
UPDATE "team" AS t
SET "name" = left(t."name", 60) || ' (duplicate ' || r.n || ')'
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "tenant_id", lower("name") ORDER BY "created_at", "id") AS n
  FROM "team"
) AS r
WHERE r."id" = t."id" AND r.n > 1;

CREATE UNIQUE INDEX "team_tenant_id_lower_name_key" ON "team" ("tenant_id", lower("name"));
