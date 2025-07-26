import { Text, StyleSheet, TextProps } from 'react-native';

type DefaultTextProps = TextProps & {
  children: React.ReactNode;
};

const styles = StyleSheet.create({
  text: {
    fontFamily: 'Outfit-Regular',
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
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
