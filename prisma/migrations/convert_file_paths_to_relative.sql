-- Migration: Convert File.path from absolute to relative paths
-- This migration converts all File.path values from absolute paths to paths relative to NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER
-- 
-- IMPORTANT: Before running this migration, ensure you have:
-- 1. A backup of your database
-- 2. Set the music_library_folder variable below to match your NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER value
--    (expand $HOME to the actual home directory path, e.g., /Users/YourName/Music/Empty)
-- 3. Verified that all current File.path values start with this folder path
--
-- Usage:
--   1. Replace '/Users/Flo/Music/Empty' below with your actual NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER path
--   2. Run: psql -d databasename -f prisma/migrations/convert_file_paths_to_relative.sql

-- Set your music library folder path here (expanded, not with $HOME variable)
-- Example: /Users/YourName/Music/Empty or /home/username/Music/Empty
\set music_library_folder '/Users/Flo/Music/Empty'

-- Start transaction
BEGIN;

-- Verify all paths start with the library folder (safety check)
DO $$
DECLARE
  invalid_count INTEGER;
  music_folder TEXT := '/Users/Flo/Music/Empty';
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM "File"
  WHERE path NOT LIKE music_folder || '%';
  
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Found % File records with paths not starting with %. Aborting migration.', invalid_count, music_folder;
  END IF;
  
  RAISE NOTICE 'All File.path values start with the music library folder. Proceeding with migration.';
END $$;

-- Convert absolute paths to relative by removing the music library folder prefix
-- Also removes the leading slash after the prefix
UPDATE "File"
SET path = REGEXP_REPLACE(path, '^' || :'music_library_folder' || '/?', '')
WHERE path LIKE :'music_library_folder' || '%';

-- Verify the conversion worked
DO $$
DECLARE
  total_count INTEGER;
  absolute_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM "File";
  SELECT COUNT(*) INTO absolute_count FROM "File" WHERE path LIKE '/%';
  
  RAISE NOTICE 'Total File records: %', total_count;
  RAISE NOTICE 'Records with absolute paths (starting with /): %', absolute_count;
  
  IF absolute_count > 0 THEN
    RAISE WARNING 'Some paths still appear to be absolute. Please review before committing.';
  ELSE
    RAISE NOTICE 'All paths successfully converted to relative format.';
  END IF;
END $$;

-- Commit the transaction
-- Remove the -- below to actually commit the changes
-- COMMIT;

-- For safety, keep transaction open by default
-- Review the output above, then manually run COMMIT; if everything looks correct
-- Or run ROLLBACK; to undo the changes
