import {
  GestureResponderEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import React, { FC, ReactNode } from 'react';
import DefaultText from '../DefaultText';
import { colors, sizes, typography } from '../../constants/styling.tsx';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  children?: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
}

interface ActionProps {
  text: string;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  icon?: React.ComponentType<{ height: number; fill?: string }>;
}

const styles = StyleSheet.create({
  mainContainer: {
    position: 'absolute',
    bottom: sizes.navbarHeight,
    left: scale(20),
    flexDirection: 'column',
    gap: verticalScale(4),
    borderRadius: moderateScale(18),
    backgroundColor: colors.accentPrimary,
    paddingVertical: moderateScale(16),
    paddingHorizontal: moderateScale(18),
    shadowColor: '#1A2F1B',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    minWidth: scale(200),
  },
  actionItem: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(14),
    paddingVertical: verticalScale(6),
  },
  actionTitle: {
    color: colors.textOnAccent,
    fontSize: typography.body,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  actionIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(21),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
});

export const MainContainer = ({ children }: Props) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.mainContainer, { bottom: sizes.navbarHeight + insets.bottom + 10 }]}>
      {children}
    </View>
  );
};

export const ActionItem = ({ onPress, icon, text }: ActionProps) => {
  return (
    <Pressable
      style={({ pressed }) => [styles.actionItem, { opacity: pressed ? 0.8 : 1 }]}
      onPress={onPress}
    >
      <ActionIcon icon={icon} text={text} />
      <ActionTitle>{text}</ActionTitle>
    </Pressable>
  );
};

export const ActionTitle = ({ children }: Props) => {
  return <DefaultText style={[styles.actionTitle]}>{children}</DefaultText>;
};

export const ActionIcon = ({ icon: Icon }: ActionProps) => {
  if (!Icon) return null;
  return (
    <View style={[styles.actionIcon]}>
      <Icon height={22} fill="#FFFFFF" />
    </View>
  );
};
