import { StyleSheet, View, ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
    width: '100%',
    minWidth: '100%',
    minHeight: '100%',
  },
});

const PageContainer = ({ children, style, ...props }: DefaultViewProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + 25 }, style]}
      {...props}
    >
      {children}
    </View>
  );
};

export default PageContainer;
