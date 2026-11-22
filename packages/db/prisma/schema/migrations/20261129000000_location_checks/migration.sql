-- The API validates these, but the database is the last line of defence for every writer.
ALTER TABLE "location" ADD CONSTRAINT "location_kind_check"
  CHECK (kind IN ('portfolio', 'region', 'site', 'building', 'floor', 'zone', 'space'));
ALTER TABLE "location" ADD CONSTRAINT "location_status_check"
  CHECK (status IN ('open', 'closed', 'mothballed', 'sold'));
ALTER TABLE "location" ADD CONSTRAINT "location_version_check" CHECK (version > 0);
ALTER TABLE "location" ADD CONSTRAINT "location_text_check" CHECK (btrim(name) <> '' AND btrim(code) <> '');
