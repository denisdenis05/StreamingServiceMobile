/**
 * Converts a hex color string to an RGB object.
 */
export const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
        }
        : null;
};

/**
 * Calculates the relative luminance of a color.
 * Returns a value between 0 (black) and 1 (white).
 */
export const getLuminance = (r: number, g: number, b: number) => {
    const a = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
};

/**
 * Adjusts the brightness of a color.
 * @param hex The input hex color.
 * @param amount The amount to darken/lighten (-1 to 1). Negative darkens.
 */
export const adjustColor = (hex: string, amount: number) => {
    let usePound = false;
    if (hex[0] === "#") {
        hex = hex.slice(1);
        usePound = true;
    }
    const num = parseInt(hex, 16);
    let r = (num >> 16) + amount * 255;
    let b = ((num >> 8) & 0x00FF) + amount * 255;
    let g = (num & 0x0000FF) + amount * 255;

    if (r > 255) r = 255;
    else if (r < 0) r = 0;

    if (b > 255) b = 255;
    else if (b < 0) b = 0;

    if (g > 255) g = 255;
    else if (g < 0) g = 0;

    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
}

/**
 * Ensures a color has enough contrast with white text.
 * If too bright, darkens it. color should be hex.
 */
export const ensureContrastWithWhite = (color: string) => {
    const rgb = hexToRgb(color);
    if (!rgb) return color;

    const luminance = getLuminance(rgb.r, rgb.g, rgb.b);

    // Luminance threshold for white text readability (approx < 0.5 is safe-ish, < 0.179 is accessible)
    // For overlay look, we want it somewhat dark.
    if (luminance > 0.4) {
        // Too bright, darken it
        // Calculate how much to darken? simpler approach: darken by fixed steps
        return adjustColor(color, -0.4);
    }

    // Also avoid pure black if possible to keep it "colorful"
    if (luminance < 0.02) {
        return adjustColor(color, 0.2);
    }

    return color;
};
