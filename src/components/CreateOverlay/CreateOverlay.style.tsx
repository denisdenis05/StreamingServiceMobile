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

interface Props {
  children?: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
}

interface ActionProps {
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  icon?: FC<any>;
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
    borderRadius: 10,
    backgroundColor: colors.veryLowOpacityText,
    padding: 20,
  },
  actionItem: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 15,
  },
  actionTitle: {
    color: colors.normalText,
    margin: 0,
    marginTop: 5,
    fontSize: 22,
    fontWeight: 'bold',
  },
  actionIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
    borderRadius: 50,
    backgroundColor: colors.lowOpacityText,
  },
});

export const MainContainer = ({ children }: Props) => {
  return <View style={[styles.mainContainer]}>{children}</View>;
};

export const ActionItem = ({ onPress, icon }: ActionProps) => {
  return (
    <Pressable style={[styles.actionItem]} onPress={onPress}>
      <ActionIcon icon={icon} />
      <ActionTitle>Create a Playlist</ActionTitle>
    </Pressable>
  );
};

export const ActionTitle = ({ children }: Props) => {
  return <DefaultText style={[styles.actionTitle]}>{children}</DefaultText>;
};

export const ActionIcon = ({ icon: Icon }: ActionProps) => {
  return (
    <View style={[styles.actionIcon]}>
      <Icon height={30} />
    </View>
  );
};
