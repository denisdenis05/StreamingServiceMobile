import React, { ReactNode } from 'react';
import {
  Image,
  ImageProps,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from '../../constants/styling.tsx';
import DefaultText from '../../components/DefaultText';

interface Props {
  children: ReactNode;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    padding: 20,
    gap: 20,
  },
  dragIndicator: {
    width: 40,
    height: 4,
    backgroundColor: '#666',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  actionTitle: {
    color: colors.normalText,
    margin: 0,
    marginTop: 5,
    fontSize: 18,
    fontWeight: 'bold',
    textAlignVertical: 'center',
  },
  centeredContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '80%',
    width: '100%',
  },
});

export const BackdropContainer = ({ children }: Props) => {
  return <View style={styles.backdrop}>{children}</View>;
};

export const ContentContainer = ({ children }: Props) => {
  return <SafeAreaView style={styles.content}>{children}</SafeAreaView>;
};

export const DragIndicator = () => {
  return <View style={styles.dragIndicator} />;
};

export const CardTitle = ({ children }: Props) => {
  return <DefaultText style={[styles.actionTitle]}>{children}</DefaultText>;
};

export const CenteredContainer = ({ children }: Props) => {
  return <View style={styles.centeredContainer}>{children}</View>;
};
