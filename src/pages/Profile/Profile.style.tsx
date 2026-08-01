import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { ReactNode } from 'react';
import DefaultText from '../../components/DefaultText';
import ScrollView = Animated.ScrollView;
import { sizes, typography } from '../../constants/styling.tsx';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';

interface Props {
  children: ReactNode;
}

const styles = StyleSheet.create({
  contentContainer: {
    flexGrow: 1,
    display: 'flex',
    width: '100%',
    minHeight: '100%',
    flexDirection: 'column',
    gap: verticalScale(40),
    paddingBottom: sizes.navbarHeight,
  },
  lastFmButton: {
    height: verticalScale(45),
    borderRadius: moderateScale(8),
    paddingHorizontal: scale(20),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(8),
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: verticalScale(2),
    },
    shadowOpacity: 0.25,
    shadowRadius: moderateScale(3.84),
    elevation: 5,
  },
  lastFmButtonConnected: {
    backgroundColor: '#4CAF50',
  },
  lastFmButtonDisconnected: {
    backgroundColor: '#d51007',
  },
  lastFmButtonDisabled: {
    backgroundColor: '#666',
    opacity: 0.7,
  },
  lastFmButtonText: {
    color: 'white',
    fontSize: typography.body,
    fontWeight: '600',
  },
});

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

interface LastFmButtonProps {
  connected: boolean;
  loading: boolean;
  onPress: () => void;
}

export const LastFmButton: React.FC<LastFmButtonProps> = ({
  connected,
  loading,
  onPress,
}) => {
  const getButtonStyle = (): ViewStyle[] => {
    const baseStyle = [styles.lastFmButton];

    if (loading) return [...baseStyle, styles.lastFmButtonDisabled];
    if (connected) return [...baseStyle, styles.lastFmButtonConnected];
    return [...baseStyle, styles.lastFmButtonDisconnected];
  };

  const getButtonText = (): string => {
    if (loading) return 'Loading...';
    if (connected) return '✅ Last.fm Connected';
    return 'Connect to Last.fm';
  };

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.7}
    >
      {loading && <ActivityIndicator size="small" color="white" />}
      <DefaultText style={styles.lastFmButtonText}>
        {getButtonText()}
      </DefaultText>
    </TouchableOpacity>
  );
};
