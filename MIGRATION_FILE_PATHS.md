# File Path Migration: Absolute to Relative

This document explains the migration from storing absolute file paths to relative file paths in the database.

## Overview

The `File` table in the database now stores paths **relative** to `NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER` instead of absolute paths. This makes the database more portable and allows the music library folder to be relocated without database changes.

## Migration Steps

### 1. Backup Your Database

Before running the migration, **create a full backup** of your database.

### 2. Update the Migration Script

Edit `prisma/migrations/convert_file_paths_to_relative.sql`:

1. Replace `/Users/Flo/Music/Empty` with your actual `NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER` path
2. Make sure to expand the `$HOME` variable to the full path (e.g., `/Users/YourName/Music/Empty`)

### 3. Run the Migration

```bash
# Using psql (PostgreSQL)
psql -d databasename -f prisma/migrations/convert_file_paths_to_relative.sql

# Review the output to ensure all paths were converted successfully
# If everything looks good, run:
# COMMIT;

# If there are issues:
# ROLLBACK;
```

The migration script:
- Validates that all existing paths start with your music library folder
- Converts absolute paths to relative paths
- Verifies the conversion was successful
- Keeps the transaction open by default for safety

### 4. Deploy Code Changes

After successfully running the migration, deploy the updated code. The code changes include:

- **Database writes**: All file paths are now stored as relative paths
- **Database reads**: Paths are joined with `NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER` for filesystem operations
- **File watcher**: Converts chokidar's absolute paths to relative before database queries
- **Upload handler**: Converts paths to relative for database queries

## What Changed

### Database Schema
- `File.path` now contains relative paths (e.g., `Artist/Album/01 Track.mp3`)
- Previously contained absolute paths (e.g., `/Users/Flo/Music/Empty/Artist/Album/01 Track.mp3`)

### Code Changes

#### Files Modified:
1. **src/server/db/createTrack.ts**
   - Stores `relativePath` instead of absolute `path` in database
   - Joins with library folder when checking existing file paths

2. **src/server/persistent/watcher.ts**
   - Converts chokidar's absolute paths to relative for all database queries
   - File add, unlink, and move operations all use relative paths

3. **src/pages/api/file/[id].ts**
   - Joins `NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER` with `file.path` for filesystem operations
   - Logging now uses relative path directly (already relative in DB)

4. **src/server/trpc/router/edit/track.ts**
   - Joins path with library folder for `parseFile()` and `acoustId.identify()`
   - Unlink operations use joined absolute path

5. **src/server/trpc/router/edit/artist.ts** & **album.ts**
   - Delete operations join path with library folder before unlinking files

6. **src/pages/api/cold-start.tsx**
   - Validation compares joined absolute paths with filesystem scan results

7. **src/pages/api/upload/index.tsx**
   - Converts proposed path to relative before querying database

## Verification

After migration and deployment, verify:

1. **File playback works**: Try playing tracks from different albums
2. **File upload works**: Upload a new track
3. **File deletion works**: Delete a test track
4. **Watcher works**: Add/remove a file directly in the music folder
5. **Check logs**: Ensure no "file not found" errors

## Rollback

If issues occur, you can rollback:

1. **Database**: Restore from backup taken in step 1
2. **Code**: Revert to the previous commit

## Benefits

- **Portability**: Database can be moved between systems with different music library locations
- **Flexibility**: Music library folder can be relocated without database migration
- **Consistency**: Matches the pattern already used by the `Image` table
- **Cleaner logs**: File paths in logs are now relative and easier to read

## Technical Notes

- The `Image` table already used relative paths, so it didn't need migration
- All filesystem operations (`readFile`, `createReadStream`, `parseFile`, `unlink`, etc.) now join the relative path with `NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER`
- Database queries use relative paths for lookups
- External libraries (like `acoustId.identify`) receive absolute paths (joined before calling)
