import { MediaSourceKind, MediaSourceValidator } from 'streaming-service-player';
import type { MediaSourceConfiguration, QueueEntry } from 'streaming-service-player';
import { PlaybackTrackPolicy } from './PlaybackTrack';
import type { PlaybackCacheReader, PlaybackTrack, PlaybackTrackView, PreparedPlaybackTrack } from './PlaybackTrack';

export class PlaybackTrackMapper {
  private readonly mediaValidator = new MediaSourceValidator();

  constructor(
    private readonly mediaServerAddress: string,
    private readonly cacheReader: PlaybackCacheReader,
  ) {}

  async prepare(track: PlaybackTrack, entryIdentifier: string): Promise<PreparedPlaybackTrack> {
    if (track.mediaSource !== undefined) this.mediaValidator.validateSource(track.mediaSource);
    const capturedTrack: PlaybackTrack = { ...track,
      ...(track.mediaSource === undefined ? {} : { mediaSource: this.copySource(track.mediaSource) }),
      ...(track.mediaRequest === undefined ? {} : { mediaRequest: this.copyRequest(track.mediaRequest) }) };
    return this.prepareCapturedTrack(capturedTrack, entryIdentifier);
  }

  private async prepareCapturedTrack(track: PlaybackTrack, entryIdentifier: string): Promise<PreparedPlaybackTrack> {
    if (!track.mediaAddress) throw new Error(PlaybackTrackPolicy.missingAddressMessage);
    if (track.durationSeconds !== undefined && (!Number.isFinite(track.durationSeconds)
      || track.durationSeconds < PlaybackTrackPolicy.minimumDurationSeconds
      || track.durationSeconds * PlaybackTrackPolicy.millisecondsPerSecond > PlaybackTrackPolicy.maximumDurationMilliseconds)) {
      throw new Error(PlaybackTrackPolicy.invalidDurationMessage);
    }
    const catalogTrack = this.isCatalogTrack(track);
    const source = await this.resolveSource(track, catalogTrack);
    if (source !== null) this.mediaValidator.validateSource(source);
    const artist = track.artist?.trim() || PlaybackTrackPolicy.unknownArtist;
    const title = track.title?.trim() || PlaybackTrackPolicy.untitledTrack;
    const entry: QueueEntry = {
      entryIdentifier,
      title,
      artist,
      ...(source === null && track.recordingIdentifier !== undefined ? { recordingIdentifier: track.recordingIdentifier } : {}),
      ...(track.album === undefined ? {} : { album: track.album }),
      ...(track.artworkAddress === undefined ? {} : { artworkAddress: track.artworkAddress }),
      ...(track.playlistIdentifier === undefined ? {} : { playlistIdentifier: track.playlistIdentifier }),
      ...(track.durationSeconds === undefined ? {} : {
        durationHintMilliseconds: Math.round(track.durationSeconds * PlaybackTrackPolicy.millisecondsPerSecond),
      }),
    };
    const view: PlaybackTrackView = {
      entryIdentifier,
      title,
      artist,
      isLocalCached: source?.kind === MediaSourceKind.Local,
      ...(track.recordingIdentifier === undefined ? {} : { recordingIdentifier: track.recordingIdentifier }),
      ...(track.album === undefined ? {} : { album: track.album }),
      ...(track.albumIdentifier === undefined ? {} : { albumIdentifier: track.albumIdentifier }),
      ...(track.artworkAddress === undefined ? {} : { artworkAddress: track.artworkAddress }),
      ...(track.playlistIdentifier === undefined ? {} : { playlistIdentifier: track.playlistIdentifier }),
      ...(track.isLiked === undefined ? {} : { isLiked: track.isLiked }),
    };
    return { entry, source, view };
  }

  private isCatalogTrack(track: PlaybackTrack): boolean {
    if (track.mediaSource !== undefined || track.mediaRequest !== undefined || !track.recordingIdentifier) return false;
    const baseAddress = this.mediaServerAddress.endsWith(PlaybackTrackPolicy.pathSeparator)
      ? this.mediaServerAddress : this.mediaServerAddress + PlaybackTrackPolicy.pathSeparator;
    return track.mediaAddress === baseAddress + PlaybackTrackPolicy.catalogStreamRoute + encodeURIComponent(track.recordingIdentifier);
  }

  private async resolveSource(track: PlaybackTrack, catalogTrack: boolean): Promise<MediaSourceConfiguration | null> {
    if (track.mediaSource !== undefined) return this.copySource(track.mediaSource);
    if (track.mediaAddress.startsWith(PlaybackTrackPolicy.localFileAddressPrefix)) {
      return { kind: MediaSourceKind.Local, address: track.mediaAddress };
    }
    if (catalogTrack) {
      let cachedAddress: string | null;
      try { cachedAddress = await this.cacheReader.findReadableCachedAddress(track.mediaAddress); }
      catch { cachedAddress = null; }
      return cachedAddress === null ? null : { kind: MediaSourceKind.Local, address: cachedAddress };
    }
    return { kind: MediaSourceKind.Remote, address: track.mediaAddress,
      ...(track.mediaRequest === undefined ? {} : { request: this.copyRequest(track.mediaRequest) }) };
  }

  private copyRequest(request: NonNullable<PlaybackTrack['mediaRequest']>): NonNullable<PlaybackTrack['mediaRequest']> {
    return {
      ...(request.method === undefined ? {} : { method: request.method }),
      ...(request.headers === undefined ? {} : { headers: request.headers.map(header => ({ name: header.name, value: header.value })) }),
      ...(request.body === undefined ? {} : { body: { encoding: request.body.encoding, value: request.body.value, contentType: request.body.contentType } }),
      ...(request.credentialIdentifier === undefined ? {} : { credentialIdentifier: request.credentialIdentifier }),
    };
  }

  private copySource(source: MediaSourceConfiguration): MediaSourceConfiguration {
    switch (source.kind) {
      case MediaSourceKind.Catalog: return { kind: source.kind, recordingIdentifier: source.recordingIdentifier };
      case MediaSourceKind.Local: return { kind: source.kind, address: source.address };
      case MediaSourceKind.Remote: return { kind: source.kind, address: source.address,
        ...(source.request === undefined ? {} : { request: this.copyRequest(source.request) }) };
      case MediaSourceKind.Resolved: return { kind: source.kind, address: source.address, request: this.copyRequest(source.request),
        ...(source.mediaRequest === undefined ? {} : { mediaRequest: this.copyRequest(source.mediaRequest) }) };
    }
  }
}
