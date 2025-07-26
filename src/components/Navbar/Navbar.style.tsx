import { StyleSheet, View } from 'react-native';
import { ReactNode } from 'react';
import { colors } from '../../constants/styling.tsx';
import LinearGradient from 'react-native-linear-gradient';

interface Props {
  children: ReactNode;
}

const styles = StyleSheet.create({
  gradientContainer: {
    position: 'absolute',
    height: 100,
    width: '100%',
    bottom: 0,
    paddingHorizontal: 30,
    paddingTop: 20,
    paddingBottom: 10,
    alignItems: 'center',
  },
  mainContainer: {
    display: 'flex',
    flexDirection: 'row',
    gap: 20,
  },
});

export const GradientContainer = ({ children }: Props) => {
  return (
    <LinearGradient
      colors={colors.navbarGradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.gradientContainer}
    >
      {children}
    </LinearGradient>
  );
};

export const MainContainer = ({ children }: Props) => {
  return <View style={[styles.mainContainer]}>{children}</View>;
};
