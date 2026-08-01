import {
  Image,
  ImageProps,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ReactNode } from 'react';
import DefaultText from '../../components/DefaultText';
import { colors, fonts, sizes, typography } from '../../constants/styling.tsx';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';

interface Props {
  children: ReactNode;
}

const styles = StyleSheet.create({
  headerContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  wrapper: {
    flex: 1,
    flexDirection: 'column',
    width: '100%',
  },
  topSection: {
    paddingHorizontal: scale(20),
    gap: verticalScale(20),
    paddingTop: verticalScale(10),
  },
  image: {
    height: moderateScale(40),
    width: moderateScale(40),
    borderRadius: moderateScale(20),
  },
  title: { fontFamily: fonts.serif, fontSize: typography.pageTitle, letterSpacing: -0.3 },
  searchInput: {
    height: verticalScale(44),
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(14),
    color: colors.normalText,
    backgroundColor: colors.surfaceCard,
    fontSize: typography.inputText,
    fontFamily: fonts.sansSerif,
  },
  sectionTitle: {
    fontFamily: fonts.serif,
    fontSize: typography.sectionTitle,
    color: colors.normalText,
    marginTop: verticalScale(20),
    marginBottom: verticalScale(10),
  },
  listContent: {
    paddingHorizontal: scale(20),
    paddingBottom: sizes.navbarHeight + verticalScale(20),
  },
  loadingMore: {
    paddingVertical: verticalScale(16),
    alignItems: 'center',
  },
});

export const HeaderContainer = ({ children }: Props) => (
  <View style={styles.headerContainer}>{children}</View>
);

export const Wrapper = ({ children }: Props) => (
  <View style={styles.wrapper}>{children}</View>
);

export const TopSection = ({ children }: Props) => (
  <View style={styles.topSection}>{children}</View>
);

export const StyledImage = ({ source }: ImageProps) => (
  <Image source={source} style={styles.image} resizeMode="cover" />
);

export const HeaderTitle = ({ children }: Props) => (
  <DefaultText style={styles.title}>{children}</DefaultText>
);

export const SearchInput = ({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) => (
  <TextInput
    style={styles.searchInput}
    placeholder={placeholder || 'Search...'}
    placeholderTextColor={colors.slightlyTransparentText}
    value={value}
    onChangeText={onChangeText}
  />
);

export const SectionTitle = ({ children }: Props) => (
  <DefaultText style={styles.sectionTitle}>{children}</DefaultText>
);

export const listContentStyle = styles.listContent;
export const loadingMoreStyle = styles.loadingMore;
