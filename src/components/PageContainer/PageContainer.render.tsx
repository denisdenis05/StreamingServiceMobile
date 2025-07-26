import { StyleSheet, View, ViewProps } from 'react-native';
import { colors } from '../../constants/styling.tsx';

type DefaultViewProps = ViewProps & {
  children: React.ReactNode;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 30,
    paddingTop: 100,
  },
});

const PageContainer = ({ children, style, ...props }: DefaultViewProps) => {
  return (
    <View style={[styles.container, style]} {...props}>
      {children}
    </View>
  );
};

export default PageContainer;
