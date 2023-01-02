import { prisma } from "server/db/client"
import retryable from "utils/retryable"
import { socketServer } from "utils/typedWs/server"

export async function computeAlbumCover(id: string, propagate: {artist?: boolean, tracks?: boolean}) {
  const album = await retryable(() => prisma.album.findUnique({
    where: { id },
    select: {
      coverId: true,
      artistId: true,
    }
  }))

  if (!album) return

  const changed = await retryable(() => getAndSetAlbumCover(id, album))

  if (changed && propagate.artist) {
    if (album.artistId) {
      await retryable(() => computeArtistCover(album.artistId!, {album: false, tracks: true}))
    }
  }
  if (changed && propagate.tracks) {
    const albumWithTracks = await retryable(() => prisma.album.findUnique({
      where: {id},
      select: {tracks: {select: {id: true}}}
    }))
    for (const track of albumWithTracks!.tracks) {
      await retryable(() => computeTrackCover(track.id, {album: false, artist: true}))
    }
  }

  if (changed) {
    socketServer.emit("invalidate", { type: "album", id })
  }

  return changed
}

export async function listAlbumCovers(id: string, include: {tracks?: boolean} = {}) {
  const data = await prisma.album.findUnique({
    where: { id },
    select: {
      spotify: { select: { imageId: true } },
      audiodb: { select: { thumbHqId: true, thumbId: true } },
      lastfm: { select: { coverId: true } },
      ...(include.tracks && { tracks: { select: { id: true } } }),
    },
  })
  if (!data) throw new Error(`Album ${id} not found`)
  const covers = new Set<string>()
  if (data?.spotify?.imageId) covers.add(data.spotify.imageId)
  if (data?.audiodb?.thumbHqId) covers.add(data.audiodb.thumbHqId)
  if (data?.audiodb?.thumbId) covers.add(data.audiodb.thumbId)
  if (data?.lastfm?.coverId) covers.add(data.lastfm.coverId)
  if (include.tracks) {
    for (const track of data.tracks!) {
      const trackCovers = await listTrackCovers(track.id, {album: false})
      trackCovers.forEach(covers.add, covers)
    }
  }
  return Array.from(covers)
}

async function getAndSetAlbumCover(id: string, album: { artistId: string | null; coverId: string | null }) {
  let newCoverId: string | null | undefined
  cover: {
    const spotify = await prisma.spotifyAlbum.findUnique({
      where: { albumId: id },
      select: { imageId: true }
    })
    if (newCoverId = spotify?.imageId)
      break cover

    const audioDb = await prisma.audioDbAlbum.findUnique({
      where: { entityId: id },
      select: {
        thumbHqId: true,
        thumbId: true
      }
    })
    if (newCoverId = audioDb?.thumbHqId)
      break cover
    if (newCoverId = audioDb?.thumbId)
      break cover

    const lastFm = await prisma.lastFmAlbum.findUnique({
      where: { entityId: id },
      select: { coverId: true },
    })
    if (newCoverId = lastFm?.coverId)
      break cover

    const track = await prisma.track.findFirst({
      where: {
        albumId: id,
        coverId: { not: null }
      }
    })
    if (newCoverId = track?.coverId)
      break cover
  }
  if (newCoverId && newCoverId !== album.coverId) {
    await prisma.album.update({
      where: { id },
      data: { cover: { connect: { id: newCoverId } } }
    })
    return newCoverId
  }
  return false
}

export async function computeTrackCover(id: string, propagate: {album?: boolean, artist?: boolean}) {
  const track = await retryable(() => prisma.track.findUnique({
    where: { id },
    select: {
      coverId: true,
      albumId: true,
      artistId: true,
      metaImageId: true,
    }
  }))

  if (!track) return

  const changed = await retryable(() => getAndSetTrackCover(id, track))

  if (changed && propagate.album) {
    if (track.albumId) {
      await retryable(() => computeAlbumCover(track.albumId!, {artist: true, tracks: false}))
    }
  }
  if (changed && propagate.artist) {
    if (track.artistId) {
      await retryable(() => computeArtistCover(track.artistId!, {album: true, tracks: false}))
    }
  }

  if (changed) {
    socketServer.emit("invalidate", { type: "track", id })
  }

  return changed
}

export async function listTrackCovers(id: string, include: {album?: boolean} = {}) {
  const data = await prisma.track.findUnique({
    where: { id },
    select: {
      spotify: { select: { album: { select: { imageId: true } } } },
      audiodb: { select: { thumbId: true } },
      lastfm: { select: { album: { select: { coverId: true } } } },
      metaImageId: true,
      ...(include.album && { album: { select: { id: true } } }),
    },
  })
  if (!data) throw new Error(`Track ${id} not found`)
  const covers = new Set<string>()
  if (data?.spotify?.album?.imageId) covers.add(data.spotify.album.imageId)
  if (data?.audiodb?.thumbId) covers.add(data.audiodb.thumbId)
  if (data?.lastfm?.album?.coverId) covers.add(data.lastfm.album.coverId)
  if (data?.metaImageId) covers.add(data.metaImageId)
  if (include.album) {
    const albumCovers = await listAlbumCovers(data.album!.id, {tracks: false})
    albumCovers.forEach(covers.add, covers)
  }
  return Array.from(covers)
}

async function getAndSetTrackCover(id: string, track: {
  albumId: string | null;
  artistId: string | null;
  coverId: string | null;
  metaImageId: string | null;
}) {
  let newCoverId: string | null | undefined
  cover: {
    if (track.albumId) {
      const album = await prisma.album.findUnique({
        where: {id: track.albumId},
        select: {coverId: true}
      })
      if (newCoverId = album?.coverId) break cover
    }

    const spotify = await prisma.spotifyTrack.findUnique({
      where: {trackId: id},
      select: {album: {select: {imageId: true}}}
    })
    if (newCoverId = spotify?.album?.imageId) break cover

    const audioDb = await prisma.audioDbTrack.findUnique({
      where: {entityId: id},
      select: {thumbId: true}
    })
    if (newCoverId = audioDb?.thumbId) break cover

    const lastFm = await prisma.lastFmTrack.findUnique({
      where: {entityId: id},
      select: {album: {select: {coverId: true}}}
    })
    if (newCoverId = lastFm?.album?.coverId) break cover
    
    if (newCoverId = track.metaImageId) break cover
  }
  if (newCoverId && newCoverId !== track.coverId) {
    await prisma.track.update({
      where: {id},
      data: {cover: {connect: {id: newCoverId}}}
    })
    return newCoverId
  }
  return false
}

export async function computeArtistCover(id: string, propagate: {album?: boolean, tracks?: boolean}) {
  const artist = await retryable(() => prisma.artist.findUnique({
    where: { id },
    select: {
      coverId: true
    }
  }))

  if (!artist) return

  const changed = await retryable(() => getAndSetArtistCover(id, artist))

  if (changed && propagate.album) {
    // album cover doesn't rely on artist cover
  }
  if (changed && propagate.tracks) {
    // track cover doesn't rely on artist cover
  }

  if (changed) {
    socketServer.emit("invalidate", { type: "artist", id })
  }

  return changed
}

async function getAndSetArtistCover(id: string, artist: {
  coverId: string | null;
}) {
  let newCoverId: string | null | undefined
  cover: {
    const audioDb = await prisma.audioDbArtist.findUnique({
      where: { entityId: id },
      select: {
        thumbId: true
      }
    })
    if (newCoverId = audioDb?.thumbId)
      break cover

    const spotify = await prisma.spotifyArtist.findUnique({
      where: { artistId: id },
      select: { imageId: true }
    })
    if (newCoverId = spotify?.imageId)
      break cover

    const album = await prisma.album.findFirst({
      where: {
        artistId: id,
        coverId: { not: null }
      }
    })
    if (newCoverId = album?.coverId)
      break cover

    const track = await prisma.track.findFirst({
      where: {
        artistId: id,
        coverId: { not: null }
      }
    })
    if (newCoverId = track?.coverId)
      break cover
  }
  if (newCoverId && newCoverId !== artist.coverId) {
    await prisma.artist.update({
      where: { id },
      data: { cover: { connect: { id: newCoverId } } }
    })
    return newCoverId
  }
  return false
}
