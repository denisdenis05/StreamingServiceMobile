import React, { useEffect, useState } from 'react';
import { Image, ImageProps, ImageStyle, StyleProp } from 'react-native';
import { PLACEHOLDER_ALBUM_COVER } from '../constants/placeholders';
import {
    getLocalImagePath,
    getVerySmallCoverPath,
    getOrDownloadImage,
} from '../services/cache/ImageDownloadService';

interface CachedImageProps extends Omit<ImageProps, 'source'> {
    source: ImageProps['source'];
    style?: StyleProp<ImageStyle>;
    placeholder?: ImageProps['source'];
    releaseId?: string;
    verySmallCoverUrl?: string;
}

const CachedImage: React.FC<CachedImageProps> = ({
    source,
    style,
    placeholder = { uri: PLACEHOLDER_ALBUM_COVER },
    releaseId,
    verySmallCoverUrl,
    ...remainingProps
}) => {
    const [displayUri, setDisplayUri] = useState<string | null>(null);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        let isMounted = true;
        setHasError(false);

        if (typeof source === 'number') {
            return;
        }

        const sourceUri = Array.isArray(source)
            ? source[0]?.uri
            : (source as any)?.uri;

        if (!sourceUri) {
            return;
        }

        if (sourceUri === PLACEHOLDER_ALBUM_COVER) {
            setDisplayUri(sourceUri);
            return;
        }

        if (releaseId) {
            const cachedFullPath = getLocalImagePath(releaseId);
            if (cachedFullPath) {
                setDisplayUri(cachedFullPath);
                return;
            }

            const cachedSmallPath = getVerySmallCoverPath(releaseId);
            if (cachedSmallPath) {
                setDisplayUri(cachedSmallPath);
            }

            getOrDownloadImage(releaseId, sourceUri, verySmallCoverUrl)
                .then(localPath => {
                    if (isMounted) {
                        setDisplayUri(localPath);
                    }
                })
                .catch(() => {
                    if (isMounted) {
                        setDisplayUri(sourceUri);
                    }
                });
        } else {
            setDisplayUri(sourceUri);
        }

        return () => {
            isMounted = false;
        };
    }, [source, releaseId, verySmallCoverUrl]);

    if (typeof source === 'number') {
        return <Image source={source} style={style} {...remainingProps} />;
    }

    const finalSource =
        !hasError && displayUri ? { uri: displayUri } : placeholder;

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
