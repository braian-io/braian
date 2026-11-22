INSERT INTO view_types (key, title, builtin) VALUES
    ('trash', 'Trash', true)
ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, builtin = EXCLUDED.builtin;