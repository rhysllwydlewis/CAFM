-- Grant the new permission to the built-in roles that already have the corresponding asset access.
UPDATE "role"
SET permissions = array_append(permissions, 'assets.record_readings'), updated_at = CURRENT_TIMESTAMP
WHERE builtin AND key IN ('super_user', 'administrator', 'fm_manager', 'technician')
  AND 'assets.read' = ANY(permissions)
  AND (key = 'technician' OR 'assets.manage' = ANY(permissions))
  AND NOT 'assets.record_readings' = ANY(permissions);
