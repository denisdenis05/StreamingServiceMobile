import React, { useEffect, useState } from 'react';
import { Image, ImageProps, ImageStyle, StyleProp } from 'react-native';
import { cacheImageWithApi, getCachedImage } from '../services/CachingService';
import { PLACEHOLDER_ALBUM_COVER } from '../constants/placeholders';

interface CachedImageProps extends Omit<ImageProps, 'source'> {
    source: ImageProps['source'];
    style?: StyleProp<ImageStyle>;
    placeholder?: ImageProps['source'];
}

const CachedImage: React.FC<CachedImageProps> = ({
    source,
    style,
    placeholder = { uri: PLACEHOLDER_ALBUM_COVER },
    ...props
}) => {
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;
        setError(false);

        const loadImage = async () => {
            if (typeof source === 'number') {
                setLoading(false);
                return;
            }

            const sourceUri = Array.isArray(source)
                ? source[0]?.uri
                : (source as any)?.uri;

            if (!sourceUri) {
                setLoading(false);
                return;
            }

            if (sourceUri === PLACEHOLDER_ALBUM_COVER) {
                setLoading(false);
                setImageUri(sourceUri);
                return;
            }

            try {
                const cachedPath = await getCachedImage(sourceUri);
                if (cachedPath && isMounted) {
                    setImageUri(cachedPath);
                    setLoading(false);
                    return;
                }

                const path = await cacheImageWithApi(sourceUri);
                if (isMounted) {
                    setImageUri(path);
                    setLoading(false);
                }
            } catch (error) {
                if (isMounted) {
                    setImageUri(sourceUri);
                    setLoading(false);
                }
            }
        };

        loadImage();

        return () => {
            isMounted = false;
        };
    }, [source]);

    if (typeof source === 'number') {
        return <Image source={source} style={style} {...props} />;
    }

    const finalSource = !error && imageUri ? { uri: imageUri } : placeholder;

    return (
        <Image
            source={finalSource as any}
            style={style}
            onError={() => setError(true)}
            {...props}
        />
    );
};

export default CachedImage;
