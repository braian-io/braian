-- Bind legacy structure_tree views to a structure key/id so Open structure › can reuse them.
DO $$
DECLARE
    defs jsonb;
    structure jsonb;
    label_en text;
    structure_key text;
    structure_id text;
BEGIN
    SELECT definitions INTO defs
    FROM definition_revisions
    ORDER BY model_revision DESC
    LIMIT 1;
    IF defs IS NULL THEN
        RETURN;
    END IF;
    FOR structure IN SELECT value FROM jsonb_array_elements(COALESCE(defs->'structures', '[]'::jsonb))
    LOOP
        structure_key := structure->>'key';
        structure_id := structure->>'id';
        IF structure_key IS NULL OR structure_key = '' THEN
            CONTINUE;
        END IF;
        label_en := COALESCE(structure->'labels'->>'en', structure_key);
        UPDATE views v
        SET state = v.state
            || jsonb_strip_nulls(jsonb_build_object(
                'structure_key', structure_key,
                'structure_id', structure_id
            ))
        WHERE v.type_key = 'structure_tree'
          AND v.deleted_at IS NULL
          AND (v.state->>'structure_key' IS NULL OR v.state->>'structure_key' = '')
          AND (v.state->>'structure_id' IS NULL OR v.state->>'structure_id' = '')
          AND (
            lower(trim(v.title)) = lower(trim(label_en))
            OR lower(trim(v.title)) = lower(trim(structure_key))
          );
    END LOOP;
END;
$$;