import { Text, StyleSheet, TextProps, TextStyle } from 'react-native';
import { typography } from '../../constants/styling.tsx';

type DefaultTextProps = TextProps & {
  children: React.ReactNode;
};

const styles = StyleSheet.create({
  text: {
    fontFamily: 'Outfit-Regular',
    fontSize: typography.body,
    color: '#2A2420',
    letterSpacing: -0.2,
  },
});

function sanitizeStyle(style: any): any {
  if (!style) return style;
  if (Array.isArray(style)) {
    return style.map(sanitizeStyle);
  }
  if (typeof style === 'object') {
    const cleaned = { ...style };
    if (cleaned.fontWeight === 'semibold') {
      cleaned.fontWeight = '600';
    } else if (cleaned.fontWeight === 'condensedBold') {
      cleaned.fontWeight = '700';
    } else if (cleaned.fontWeight === 'regular') {
      cleaned.fontWeight = '400';
    }
    return cleaned;
  }
  return style;
}

const DefaultText = ({ children, style, ...props }: DefaultTextProps) => {
  const sanitizedStyle = sanitizeStyle(style);
  return (
    <Text style={[styles.text, sanitizedStyle]} {...props}>
      {children}
    </Text>
  );
};

export default DefaultText;

