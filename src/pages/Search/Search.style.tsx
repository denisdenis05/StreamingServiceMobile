import {
  Animated,
  Image,
  ImageProps,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ReactNode } from 'react';
import DefaultText from '../../components/DefaultText';
import ScrollView = Animated.ScrollView;
import { sizes } from '../../constants/styling.tsx';

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
    flexGrow: 1,
    display: 'flex',
    width: '100%',
    minHeight: '100%',
    flexDirection: 'column',
    gap: 40,
    paddingBottom: sizes.navbarHeight,
  },
  image: { height: 40, width: 40, borderRadius: 20 },
  title: { fontWeight: 'bold', fontSize: 24 },
  searchInput: {
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginTop: 10,
    color: 'white',
  },
  searchResultContainer: {
    width: '100%',
    paddingHorizontal: 20,
  },
});

export const HeaderContainer = ({ children }: Props) => {
  return <View style={styles.headerContainer}>{children}</View>;
};

export const ContentContainer = ({ children }: Props) => {
  return (
    <ScrollView
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
};

export const StyledImage = ({ source }: ImageProps) => {
  return <Image source={source} style={styles.image} resizeMode="cover" />;
};

export const HeaderTitle = ({ children }: Props) => {
  return <DefaultText style={styles.title}>{children}</DefaultText>;
};

export const SearchInput = ({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) => {
  return (
    <TextInput
      style={styles.searchInput}
      placeholder={placeholder || 'Search...'}
      value={value}
      onChangeText={onChangeText}
    />
  );
};

export const SearchResultContainer = ({ children }: Props) => {
  return (
    <ScrollView style={styles.searchResultContainer}>{children}</ScrollView>
  );
};
