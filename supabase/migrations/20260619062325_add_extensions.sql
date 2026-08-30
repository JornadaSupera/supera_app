-- Extensões no schema `extensions` (convenção Supabase, nunca em `public`).
CREATE EXTENSION IF NOT EXISTS citext   WITH SCHEMA extensions;  -- texto case-insensitive
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;  -- crypt/digest/gen_salt
