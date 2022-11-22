import { prisma } from "server/db/client"
import { socketServer } from "server/persistent/ws"

export async function computeAlbumCover(id: string, propagate: {artist?: boolean, tracks?: boolean}) {
  const album = await prisma.album.findUnique({
    where: { id },
    select: {
      coverId: true,
      artistId: true,
    }
  })

  if (!album) return

  const changed = await prisma.$transaction(async (tx) => {
    let newCoverId: string | null | undefined
    cover: {
      const spotify = await tx.spotifyAlbum.findUnique({
        where: {albumId: id},
        select: {imageId: true}
      })
      if (newCoverId = spotify?.imageId) break cover

      const audioDb = await tx.audioDbAlbum.findUnique({
        where: {entityId: id},
        select: {
          thumbHqId: true,
          thumbId: true
        }
      })
      if (newCoverId = audioDb?.thumbHqId) break cover
      if (newCoverId = audioDb?.thumbId) break cover
      
      const lastFm = await tx.lastFmAlbum.findUnique({
        where: {entityId: id},
        select: {coverId: true},
      })
      if (newCoverId = lastFm?.coverId) break cover
      
      const track = await tx.track.findFirst({
        where: {
          albumId: id,
          coverId: {not: null}
        }
      })
      if (newCoverId = track?.coverId) break cover
    }
    if (newCoverId && newCoverId !== album.coverId) {
      await tx.album.update({
        where: {id},
        data: {cover: {connect: {id: newCoverId}}}
      })
      return newCoverId
    }
    return false
  })

  if (changed && propagate.artist) {
    if (album.artistId) {
      await computeArtistCover(album.artistId, {album: false, tracks: true})
    }
  }
  if (changed && propagate.tracks) {
    const albumWithTracks = await prisma.album.findUnique({
      where: {id},
      select: {tracks: {select: {id: true}}}
    })
    for (const track of albumWithTracks!.tracks) {
      await computeTrackCover(track.id, {album: false, artist: true})
    }
  }

  if (changed) {
    socketServer.send("invalidate:album", { id })
  }

  return changed
}

export async function computeTrackCover(id: string, propagate: {album?: boolean, artist?: boolean}) {
  const track = await prisma.track.findUnique({
    where: { id },
    select: {
      coverId: true,
      albumId: true,
      artistId: true,
      metaImageId: true,
    }
  })

  if (!track) return

  const changed = await prisma.$transaction(async (tx) => {
    let newCoverId: string | null | undefined
    cover: {
      if (track.albumId) {
        const album = await tx.album.findUnique({
          where: {id: track.albumId},
          select: {coverId: true}
        })
        if (newCoverId = album?.coverId) break cover
      }

      const spotify = await tx.spotifyTrack.findUnique({
        where: {trackId: id},
        select: {album: {select: {imageId: true}}}
      })
      if (newCoverId = spotify?.album?.imageId) break cover

      const audioDb = await tx.audioDbTrack.findUnique({
        where: {entityId: id},
        select: {thumbId: true}
      })
      if (newCoverId = audioDb?.thumbId) break cover

      const lastFm = await tx.lastFmTrack.findUnique({
        where: {entityId: id},
        select: {album: {select: {coverId: true}}}
      })
      if (newCoverId = lastFm?.album?.coverId) break cover
      
      if (newCoverId = track.metaImageId) break cover
    }
    if (newCoverId && newCoverId !== track.coverId) {
      await tx.track.update({
        where: {id},
        data: {cover: {connect: {id: newCoverId}}}
      })
      return newCoverId
    }
    return false
  })

  if (changed && propagate.album) {
    if (track.albumId) {
      await computeAlbumCover(track.albumId, {artist: true, tracks: false})
    }
  }
  if (changed && propagate.artist) {
    if (track.artistId) {
      await computeArtistCover(track.artistId, {album: true, tracks: false})
    }
  }

  if (changed) {
    socketServer.send("invalidate:track", { id })
  }

  return changed
}

export async function computeArtistCover(id: string, propagate: {album?: boolean, tracks?: boolean}) {
  const artist = await prisma.artist.findUnique({
    where: { id },
    select: {
      coverId: true
    }
  })

  if (!artist) return

  const changed = await prisma.$transaction(async (tx) => {
    let newCoverId: string | null | undefined
    cover: {
      const audioDb = await tx.audioDbArtist.findUnique({
        where: {entityId: id},
        select: {
          thumbId: true
        }
      })
      if (newCoverId = audioDb?.thumbId) break cover

      const spotify = await tx.spotifyArtist.findUnique({
        where: {artistId: id},
        select: {imageId: true}
      })
      if (newCoverId = spotify?.imageId) break cover

      const album = await tx.album.findFirst({
        where: {
          artistId: id,
          coverId: {not: null}
        }
      })
      if (newCoverId = album?.coverId) break cover
      
      const track = await tx.track.findFirst({
        where: {
          artistId: id,
          coverId: {not: null}
        }
      })
      if (newCoverId = track?.coverId) break cover
    }
    if (newCoverId && newCoverId !== artist.coverId) {
      await tx.artist.update({
        where: {id},
        data: {cover: {connect: {id: newCoverId}}}
      })
      return newCoverId
    }
    return false
  })

  if (changed && propagate.album) {
    // album cover doesn't rely on artist cover
  }
  if (changed && propagate.tracks) {
    // track cover doesn't rely on artist cover
  }

  if (changed) {
    socketServer.send("invalidate:artist", { id })
  }

  return changed
}