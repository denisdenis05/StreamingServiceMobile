import React from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  GestureResponderEvent,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { colors, typography } from '../../constants/styling.tsx';
import DefaultText from '../DefaultText';

type DefaultButtonProps = {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  disabled: {
    backgroundColor: colors.secondaryBackground,
    opacity: 0.6,
  },
  text: {
    color: '#FFFFFF',
    fontSize: typography.body,
    fontWeight: '600',
  },
});

const DefaultButton: React.FC<DefaultButtonProps> = ({
  title,
  onPress,
  style,
  textStyle,
  disabled = false,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled, style]}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <DefaultText style={[styles.text, textStyle]}>{title}</DefaultText>
    </TouchableOpacity>
  );
};

export default DefaultButton;
