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
    paddingTop: 50,
    width: '100%',
    minWidth: '100%',
    minHeight: '100%',
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
