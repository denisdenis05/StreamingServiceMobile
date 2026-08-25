import React, { useEffect, useState } from 'react';
import { Image, ImageProps, ImageStyle, StyleProp } from 'react-native';
import { PLACEHOLDER_ALBUM_COVER } from '../constants/placeholders';
import {
    CoverTier,
    CoverUrls,
    getBestAvailableLocalPath,
    getLocalPathForTier,
    getOrDownloadForTier,
} from '../services/cache/ImageDownloadService';

interface CachedImageProps extends Omit<ImageProps, 'source'> {
    source?: ImageProps['source'];
    style?: StyleProp<ImageStyle>;
    placeholder?: ImageProps['source'];
    releaseId?: string;
    cover?: string;
    smallCover?: string;
    verySmallCover?: string;
    tier?: CoverTier;
}

const CachedImage: React.FC<CachedImageProps> = ({
    source,
    style,
    placeholder = { uri: PLACEHOLDER_ALBUM_COVER },
    releaseId,
    cover,
    smallCover,
    verySmallCover,
    tier,
    ...remainingProps
}) => {
    const smartMode = !!(releaseId && tier);

    // Lazy initializer runs synchronously — cached images show immediately, no flicker
    const [displayUri, setDisplayUri] = useState<string | null>(() => {
        if (smartMode) {
            return getLocalPathForTier(releaseId!, tier!) ?? getBestAvailableLocalPath(releaseId!);
        }
        if (typeof source === 'number') return null;
        return Array.isArray(source)
            ? (source[0]?.uri ?? null)
            : ((source as any)?.uri ?? null);
    });

    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        let isMounted = true;
        setHasError(false);

        if (smartMode) {
            // Show best available synchronously while the async download runs
            const sync = getLocalPathForTier(releaseId!, tier!) ?? getBestAvailableLocalPath(releaseId!);
            if (sync && sync !== displayUri) setDisplayUri(sync);

            const urls: CoverUrls = { cover, smallCover, verySmallCover };
            getOrDownloadForTier(releaseId!, tier!, urls)
                .then(path => { if (isMounted) setDisplayUri(path); })
                .catch(() => { if (isMounted && cover) setDisplayUri(cover); });

            return () => { isMounted = false; };
        }

        // Plain URL mode — no local caching
        if (typeof source === 'number') return;
        const uri = Array.isArray(source)
            ? source[0]?.uri
            : (source as any)?.uri;
        if (uri) setDisplayUri(uri);

        return () => { isMounted = false; };
    }, [smartMode, releaseId, tier, cover, smallCover, verySmallCover, source]);

    if (typeof source === 'number') {
        return <Image source={source} style={style} {...remainingProps} />;
    }

    const finalSource = !hasError && displayUri ? { uri: displayUri } : placeholder;

    return (
        <Image
            source={finalSource as any}
            style={style}
            onError={() => setHasError(true)}
            {...remainingProps}
        />
    );
};

export default CachedImage;
