import React, { ReactNode } from 'react';
import {
  Image,
  ImageProps,
  SafeAreaView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { colors, fonts, typography } from '../../constants/styling.tsx';
import DefaultText from '../../components/DefaultText';
import DefaultButton from '../../components/DefaultButton';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';

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
    padding: moderateScale(20),
    gap: verticalScale(20),
  },
  dragIndicator: {
    width: scale(40),
    height: verticalScale(4),
    backgroundColor: 'rgba(42, 36, 32, 0.2)',
    borderRadius: moderateScale(2),
    alignSelf: 'center',
    marginBottom: verticalScale(20),
  },
  actionTitle: {
    color: colors.normalText,
    fontFamily: fonts.serif,
    margin: 0,
    marginTop: verticalScale(5),
    fontSize: typography.dialogTitle,
    textAlignVertical: 'center',
    letterSpacing: -0.3,
  },
  centeredContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '80%',
    width: '100%',
    gap: '10%',
  },
  styledInput: {
    height: verticalScale(56),
    width: '80%',
    minWidth: scale(250),
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(14),
    color: colors.normalText,
    backgroundColor: colors.surfaceCard,
    fontSize: typography.inputText,
    fontWeight: '400',
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.accentPrimary,
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(10),
    fontWeight: 'bold',
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

export const StyledInput = ({
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
      style={styles.styledInput}
      placeholder={placeholder || '...'}
      placeholderTextColor={colors.slightlyTransparentText}
      value={value}
      onChangeText={onChangeText}
    />
  );
};

export const StyledButton = ({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled: boolean;
}) => {
  return (
    <DefaultButton
      onPress={onPress}
      title={title}
      style={styles.button}
      disabled={disabled}
    />
  );
};
