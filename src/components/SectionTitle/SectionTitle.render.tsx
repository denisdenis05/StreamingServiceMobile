import { Text, StyleSheet, TextProps } from 'react-native';
import { colors, fonts, typography } from '../../constants/styling.tsx';

type DefaultTextProps = TextProps & {
  children: React.ReactNode;
};

const styles = StyleSheet.create({
  text: {
    fontFamily: fonts.serif,
    fontSize: typography.sectionTitle,
    color: colors.normalText,
    letterSpacing: -0.3,
  },
});

const SectionTitle = ({ children, style, ...props }: DefaultTextProps) => {
  return (
    <Text style={[styles.text, style]} {...props}>
      {children}
    </Text>
  );
};

export default SectionTitle;
