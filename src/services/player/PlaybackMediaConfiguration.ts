import { MediaSourceKind } from 'streaming-service-player';
import type { MediaRequestConfiguration, MediaSourceConfiguration } from 'streaming-service-player';

export function copyMediaRequestConfiguration(request: MediaRequestConfiguration): MediaRequestConfiguration {
  return {
    ...(request.method === undefined ? {} : { method: request.method }),
    ...(request.headers === undefined ? {} : { headers: request.headers.map(header => ({ name: header.name, value: header.value })) }),
    ...(request.body === undefined ? {} : { body: { encoding: request.body.encoding, value: request.body.value, contentType: request.body.contentType } }),
    ...(request.credentialIdentifier === undefined ? {} : { credentialIdentifier: request.credentialIdentifier }),
  };
}

export function copyMediaSourceConfiguration(source: MediaSourceConfiguration): MediaSourceConfiguration {
  switch (source.kind) {
    case MediaSourceKind.Catalog: return { kind: source.kind, recordingIdentifier: source.recordingIdentifier };
    case MediaSourceKind.Local: return { kind: source.kind, address: source.address };
    case MediaSourceKind.Remote: return { kind: source.kind, address: source.address,
      ...(source.request === undefined ? {} : { request: copyMediaRequestConfiguration(source.request) }) };
    case MediaSourceKind.Resolved: return { kind: source.kind, address: source.address, request: copyMediaRequestConfiguration(source.request),
      ...(source.mediaRequest === undefined ? {} : { mediaRequest: copyMediaRequestConfiguration(source.mediaRequest) }) };
  }
}
