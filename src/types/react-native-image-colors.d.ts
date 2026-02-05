declare module 'react-native-image-colors' {
    export interface AndroidImageColors {
        dominant?: string;
        average?: string;
        vibrant?: string;
        darkVibrant?: string;
        lightVibrant?: string;
        darkMuted?: string;
        lightMuted?: string;
        muted?: string;
        platform: 'android';
    }

    export interface IOSImageColors {
        background?: string;
        primary?: string;
        secondary?: string;
        detail?: string;
        platform: 'ios';
    }

    export interface ImageColorsOptions {
        fallback?: string;
        cache?: boolean;
        key?: string;
    }

    const getColors: (
        url: string,
        options?: ImageColorsOptions
    ) => Promise<AndroidImageColors | IOSImageColors>;

    export { getColors };
}
