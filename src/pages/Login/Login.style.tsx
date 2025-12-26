import { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../../constants/styling.tsx';
import DefaultText from '../../components/DefaultText';
import { REMEMBER_ME_TEXT } from '../../constants/texts.tsx';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';

interface Props {
  children: ReactNode;
  onPress?: () => void;
}

interface CheckBoxProps {
  children?: ReactNode;
  isChecked?: boolean;
  setIsChecked?: any;
}

interface CardSwitcheProps {
  onPress?: () => void;
  text?: string;
  buttonText?: string;
}

const styles = StyleSheet.create({
  content: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    paddingHorizontal: scale(30),
    paddingVertical: verticalScale(50),
    gap: verticalScale(100),
    backgroundColor: colors.background,
  },
  headerContainer: {
    display: 'flex',
    alignItems: 'center',
    width: '50%',
  },
  centeredContainer: {
    display: 'flex',
    gap: verticalScale(20),
    alignItems: 'center',
    width: '50%',
  },
  title: {
    color: colors.normalText,
    fontSize: moderateScale(28),
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.normalText,
    fontSize: moderateScale(18),
    fontWeight: 'bold',
  },
  styledInput: {
    height: verticalScale(60),
    width: '100%',
    minWidth: scale(250),
    backgroundColor: colors.lowOpacityText,
    borderRadius: moderateScale(8),
    paddingHorizontal: scale(10),
    color: colors.slightlyColoredText,
  },
  loginButton: {
    height: verticalScale(60),
    width: '100%',
    minWidth: scale(250),
    borderColor: colors.normalText,
    borderWidth: 2,
    borderRadius: moderateScale(8),

    display: 'flex',
    flexDirection: 'row',
    gap: scale(5),
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: colors.slightlyColoredText,
    fontSize: moderateScale(18),
    fontWeight: 'bold',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: verticalScale(16),
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.slightlyTransparentText,
  },
  dividerText: {
    marginHorizontal: scale(8),
    fontSize: moderateScale(14),
    color: colors.slightlyTransparentText,
  },
  normalTransparentText: {
    marginHorizontal: scale(8),
    fontSize: moderateScale(14),
    color: colors.slightlyTransparentText,
    margin: 0,
    padding: 0,
  },
  normalText: {
    marginHorizontal: scale(8),
    fontSize: moderateScale(14),
    color: colors.normalText,
    margin: 0,
    padding: 0,
  },
  checkboxContainer: {
    padding: moderateScale(4),
  },
  checkbox: {
    height: moderateScale(16),
    width: moderateScale(16),
    borderRadius: moderateScale(8),
    borderWidth: 2,
    borderColor: colors.normalText,
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: colors.normalText,
  },
  rememberMeContainer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  switchTextContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
});

export const ContentContainer = ({ children }: Props) => {
  return <View style={styles.content}>{children}</View>;
};

export const HeaderContainer = ({ children }: Props) => {
  return <View style={styles.headerContainer}>{children}</View>;
};

export const CenteredContainer = ({ children }: Props) => {
  return <View style={styles.centeredContainer}>{children}</View>;
};

export const Title = ({ children }: Props) => {
  return <DefaultText style={styles.title}>{children}</DefaultText>;
};

export const Subtitle = ({ children }: Props) => {
  return <DefaultText style={styles.subtitle}>{children}</DefaultText>;
};

export const StyledInput = ({
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false, // Add secureTextEntry prop
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
}) => {
  return (
    <TextInput
      style={styles.styledInput}
      placeholder={placeholder || '...'}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
    />
  );
};

export const LoginButton = ({ children, onPress }: Props) => {
  return (
    <Pressable style={[styles.loginButton]} onPress={onPress}>
      {children}
    </Pressable>
  );
};

export const ButtonText = ({ children }: Props) => {
  return <DefaultText style={styles.buttonText}>{children}</DefaultText>;
};

export function LoginDivider({ children }: Props) {
  return (
    <View style={styles.dividerContainer}>
      <View style={styles.line} />
      <DefaultText style={styles.dividerText}>{children}</DefaultText>
      <View style={styles.line} />
    </View>
  );
}

const CustomCheckbox = ({
  checked,
  onChange,
}: {
  checked: boolean | undefined;
  onChange: () => void;
}) => {
  return (
    <TouchableOpacity onPress={onChange} style={styles.checkboxContainer}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]} />
    </TouchableOpacity>
  );
};

export const RemmeberMe = ({ isChecked, setIsChecked }: CheckBoxProps) => {
  const onValueChange = () => setIsChecked(!isChecked);

  return (
    <View style={styles.rememberMeContainer}>
      <View style={styles.dividerContainer}>
        <CustomCheckbox checked={isChecked} onChange={onValueChange} />
        <DefaultText style={styles.dividerText}>{REMEMBER_ME_TEXT}</DefaultText>
      </View>
    </View>
  );
};

export const SwitchCard = ({ onPress, text, buttonText }: CardSwitcheProps) => {
  return (
    <TouchableOpacity onPress={onPress} style={styles.switchTextContainer}>
      <DefaultText style={styles.normalTransparentText}>{text}</DefaultText>
      <DefaultText style={styles.normalText}>{buttonText}</DefaultText>
    </TouchableOpacity>
  );
};
