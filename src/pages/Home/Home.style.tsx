import { Image, ImageProps, StyleSheet, View } from 'react-native';
import { ReactNode } from 'react';
import DefaultText from '../../components/DefaultText';

interface Props {
  children: ReactNode;
}

const styles = StyleSheet.create({
  headerContainer: {
    display: 'flex',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contentContainer: {
    display: 'flex',
    width: '100%',
    minHeight: '100%',
    flexDirection: 'column',
    gap: 40,
  },
  image: { height: 40, width: 40, borderRadius: 20 },
  title: { fontWeight: 'bold', fontSize: 24 },
});

export const HeaderContainer = ({ children }: Props) => {
  return <View style={styles.headerContainer}>{children}</View>;
};

export const ContentContainer = ({ children }: Props) => {
  return <View style={styles.contentContainer}>{children}</View>;
};

export const StyledImage = ({ source }: ImageProps) => {
  return <Image source={source} style={styles.image} resizeMode="cover" />;
};

export const HeaderTitle = ({ children }: Props) => {
  return <DefaultText style={styles.title}>{children}</DefaultText>;
};
