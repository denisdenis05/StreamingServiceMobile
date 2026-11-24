import React, { useEffect, useRef, useState } from 'react';
import { Image, ImageProps, ImageStyle, StyleProp } from 'react-native';
import { CoverTier, CoverUrls, getBestAvailableLocalPath, getLocalPathForTier,
  imageAddress, imageDisplayed, invalidateImage, requestImage } from '../services/cache/ImageDownloadService';
interface CachedImageProps extends Omit<ImageProps, 'source'> {
  source?: ImageProps['source']; style?: StyleProp<ImageStyle>; placeholder?: ImageProps['source'];
  releaseId?: string; cover?: string; smallCover?: string; verySmallCover?: string; tier?: CoverTier;
}
const ImagePresentationPolicy = Object.freeze({ defaultTier: 'small' as CoverTier, previewTier: 'verySmall' as CoverTier,
  placeholderAddress: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ZkAAAAASUVORK5CYII=',
  backgroundColor: '#e6e2db', filePrefix: 'file://', contentPrefix: 'content://', emptyText: '', initialRevision: 0, revisionIncrement: 1 });
interface Presentation { readonly identity: string; readonly address: string | null; readonly failed: boolean }
const CachedImage: React.FC<CachedImageProps> = ({ source, style, placeholder = { uri: ImagePresentationPolicy.placeholderAddress },
  releaseId, cover, smallCover, verySmallCover, tier = ImagePresentationPolicy.defaultTier, onError, onLoad, ...remainingProps }) => {
  const remote = typeof source === 'number' ? undefined : Array.isArray(source) ? source[ImagePresentationPolicy.initialRevision] : source;
  const sourceAddress = remote?.uri;
  const headers = remote?.headers;
  const fullAddress = cover || sourceAddress;
  const urls: CoverUrls = { cover: fullAddress, smallCover, verySmallCover };
  const desiredAddress = imageAddress(tier, urls);
  const identifier = releaseId || fullAddress || ImagePresentationPolicy.emptyText;
  const headersIdentity = JSON.stringify(headers ?? {});
  const identity = JSON.stringify([identifier, tier, fullAddress, smallCover, verySmallCover, headersIdentity]);
  const localSource = fullAddress?.startsWith(ImagePresentationPolicy.filePrefix)
    || fullAddress?.startsWith(ImagePresentationPolicy.contentPrefix);
  const [presentation, setPresentation] = useState<Presentation>(() => ({ identity, address: localSource ? fullAddress ?? null
    : getLocalPathForTier(identifier, tier, urls, headers) ?? getBestAvailableLocalPath(identifier, urls, headers), failed: false }));
  const [retryRevision, setRetryRevision] = useState<number>(ImagePresentationPolicy.initialRevision);
  const started = useRef({ identity, milliseconds: Date.now() });
  if (started.current.identity !== identity) started.current = { identity, milliseconds: Date.now() };
  const recoveredIdentity = useRef<string | null>(null);
  const currentIdentity = useRef(identity); currentIdentity.current = identity;
  useEffect(() => {
    let current = true; let loaded = false;
    if (typeof source === 'number' || localSource || desiredAddress === null) {
      setPresentation({ identity, address: localSource ? fullAddress ?? null : null, failed: false });
      return () => { current = false; };
    }
    const preview = getLocalPathForTier(identifier, tier, urls, headers) ?? getBestAvailableLocalPath(identifier, urls, headers);
    setPresentation({ identity, address: preview, failed: false });
    const desired = requestImage(identifier, tier, urls, headers);
    const previewAddress = imageAddress(ImagePresentationPolicy.previewTier, { verySmallCover, smallCover });
    const thumbnail = preview === null && previewAddress !== null && previewAddress !== desiredAddress
      ? requestImage(identifier, ImagePresentationPolicy.previewTier, { verySmallCover, smallCover }, headers) : null;
    void thumbnail?.result.then(address => {
      if (current && !loaded) setPresentation({ identity, address, failed: false });
    }).catch(() => undefined);
    void desired.result.then(address => {
      loaded = true; thumbnail?.cancel();
      if (current) setPresentation({ identity, address, failed: false });
    }).catch(() => {
      if (current) setPresentation(previous => previous.identity === identity
        ? { ...previous, failed: previous.address === null } : { identity, address: null, failed: true });
    });
    return () => { current = false; desired.cancel(); thumbnail?.cancel(); };
  }, [identity, retryRevision]);
  if (typeof source === 'number') return <Image {...remainingProps} source={source} style={style} onError={onError} onLoad={onLoad} />;
  const address = presentation.identity === identity && !presentation.failed ? presentation.address : null;
  return <Image {...remainingProps} source={address ? { uri: address } : placeholder} style={[{ backgroundColor: ImagePresentationPolicy.backgroundColor }, style]} onLoad={event => {
    onLoad?.(event);
    if (desiredAddress !== null && address !== null) imageDisplayed(desiredAddress, Math.max(ImagePresentationPolicy.initialRevision,
      Date.now() - started.current.milliseconds), headers, address);
  }} onError={event => {
    onError?.(event);
    if (address === null) return;
    setPresentation({ identity, address: null, failed: true });
    if (!localSource && desiredAddress !== null && recoveredIdentity.current !== identity) {
      recoveredIdentity.current = identity;
      void invalidateImage(desiredAddress, headers, address).then(() => {
        if (currentIdentity.current === identity) setRetryRevision(revision => revision + ImagePresentationPolicy.revisionIncrement);
      }).catch(() => undefined);
    }
  }} />;
};
export default CachedImage;
