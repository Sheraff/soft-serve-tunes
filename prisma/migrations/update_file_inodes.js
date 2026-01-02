#!/usr/bin/env node

/**
 * Migration: Update File.ino to match current filesystem inode numbers
 * 
 * This script updates all File records in the database with their current
 * filesystem inode numbers. This is useful when:
 * - Files have been moved to a different filesystem/drive
 * - The filesystem was reformatted
 * - Database was restored from backup on a different system
 * 
 * IMPORTANT: Run this AFTER the relative paths migration if you haven't already.
 */

const { PrismaClient } = require('@prisma/client')
const { stat } = require('fs/promises')
const { join } = require('path')

// Configuration
const MUSIC_LIBRARY_FOLDER = process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER
const BATCH_SIZE = 100
const DRY_RUN = process.argv.includes('--dry-run')

if (!MUSIC_LIBRARY_FOLDER) {
	console.error('ERROR: NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER environment variable is not set')
	console.error('Please set it in your .env file or export it before running this script')
	process.exit(1)
}

const prisma = new PrismaClient()

async function main() {
	console.log('='.repeat(70))
	console.log('File Inode Migration Script')
	console.log('='.repeat(70))
	console.log(`Music Library Folder: ${MUSIC_LIBRARY_FOLDER}`)
	console.log(`Dry Run Mode: ${DRY_RUN ? 'YES (no changes will be made)' : 'NO'}`)
	console.log('='.repeat(70))
	console.log()

	if (DRY_RUN) {
		console.log('⚠️  DRY RUN MODE - No changes will be made to the database')
		console.log()
	}

	// Get total count
	const totalFiles = await prisma.file.count()
	console.log(`Found ${totalFiles} files in database`)
	console.log()

	let processed = 0
	let updated = 0
	let unchanged = 0
	let errors = 0
	let duplicateInodes = new Map() // Track potential duplicates

	// Process in batches
	let hasMore = true
	let skip = 0

	while (hasMore) {
		const files = await prisma.file.findMany({
			take: BATCH_SIZE,
			skip,
			select: {
				id: true,
				path: true,
				ino: true,
			},
			orderBy: { id: 'asc' }
		})

		if (files.length === 0) {
			hasMore = false
			break
		}

		for (const file of files) {
			processed++
			const absolutePath = join(MUSIC_LIBRARY_FOLDER, file.path)

			try {
				const stats = await stat(absolutePath)
				const currentIno = stats.ino
				const dbIno = BigInt(file.ino)

				if (currentIno !== dbIno) {
					// Check for potential duplicate inode
					const existingFile = duplicateInodes.get(currentIno)
					if (existingFile) {
						console.warn(`⚠️  WARNING: Duplicate inode detected!`)
						console.warn(`   Inode ${currentIno} would be used by:`)
						console.warn(`   - ${existingFile}`)
						console.warn(`   - ${file.path}`)
						console.warn(`   Skipping update for ${file.path}`)
						errors++
						continue
					}

					duplicateInodes.set(currentIno, file.path)

					if (!DRY_RUN) {
						await prisma.file.update({
							where: { id: file.id },
							data: { ino: currentIno }
						})
					}

					console.log(`✓ Updated: ${file.path}`)
					console.log(`  Old inode: ${dbIno}`)
					console.log(`  New inode: ${currentIno}`)
					updated++
				} else {
					unchanged++
				}

				// Progress indicator
				if (processed % 50 === 0) {
					console.log(`Progress: ${processed}/${totalFiles} (${Math.round(processed / totalFiles * 100)}%)`)
				}
			} catch (error) {
				console.error(`✗ Error processing ${file.path}:`, error.message)
				errors++
			}
		}

		skip += BATCH_SIZE
	}

	console.log()
	console.log('='.repeat(70))
	console.log('Migration Summary')
	console.log('='.repeat(70))
	console.log(`Total files processed: ${processed}`)
	console.log(`Files updated: ${updated}`)
	console.log(`Files unchanged: ${unchanged}`)
	console.log(`Errors: ${errors}`)
	console.log('='.repeat(70))

	if (DRY_RUN) {
		console.log()
		console.log('⚠️  This was a DRY RUN - no changes were made')
		console.log('Run without --dry-run to apply changes')
	} else if (errors === 0 && updated > 0) {
		console.log()
		console.log('✓ Migration completed successfully!')
	} else if (errors > 0) {
		console.log()
		console.log(`⚠️  Migration completed with ${errors} errors`)
		console.log('Please review the errors above')
	} else {
		console.log()
		console.log('ℹ️  No changes needed - all inodes are up to date')
	}
}

main()
	.catch((error) => {
		console.error('Fatal error:', error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
