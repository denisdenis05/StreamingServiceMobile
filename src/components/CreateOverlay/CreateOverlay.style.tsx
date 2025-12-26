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
import { colors, sizes } from '../../constants/styling.tsx';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';

interface Props {
  children?: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
}

interface ActionProps {
  text: string;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  icon?: React.ComponentType<{ height: number }>;
}

const styles = StyleSheet.create({
  mainContainer: {
    position: 'absolute',
    bottom: sizes.navbarHeight,
    justifyContent: 'space-between',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    width: '80%',
    height: 'auto',
    borderRadius: moderateScale(10),
    backgroundColor: colors.secondaryBackground,
    padding: moderateScale(20),
  },
  actionItem: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: scale(15),
  },
  actionTitle: {
    color: colors.normalText,
    margin: 0,
    marginTop: verticalScale(5),
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    textAlignVertical: 'center',
  },
  actionIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: moderateScale(50),
    height: moderateScale(50),
    borderRadius: moderateScale(50),
    backgroundColor: colors.lowOpacityText,
  },
});

export const MainContainer = ({ children }: Props) => {
  return <View style={[styles.mainContainer]}>{children}</View>;
};

export const ActionItem = ({ onPress, icon, text }: ActionProps) => {
  return (
    <Pressable style={[styles.actionItem]} onPress={onPress}>
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
      <Icon height={30} />
    </View>
  );
};
