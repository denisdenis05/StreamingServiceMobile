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
    paddingHorizontal: 30,
    paddingVertical: 50,
    gap: 100,
    backgroundColor: colors.background,
  },
  headerContainer: {
    display: 'flex',
    alignItems: 'center',
    width: '50%',
  },
  centeredContainer: {
    display: 'flex',
    gap: 20,
    alignItems: 'center',
    width: '50%',
  },
  title: {
    color: colors.normalText,
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    color: colors.normalText,
    fontSize: 18,
    fontWeight: 'bold',
  },
  styledInput: {
    height: 60,
    width: '100%',
    minWidth: 250,
    backgroundColor: colors.lowOpacityText,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: colors.sloghtlyColoredText,
  },
  loginButton: {
    height: 60,
    width: '100%',
    minWidth: 250,
    borderColor: colors.normalText,
    borderWidth: 2,
    borderRadius: 8,

    display: 'flex',
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: colors.sloghtlyColoredText,
    fontSize: 18,
    fontWeight: 'bold',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.slightlyTransparentText,
  },
  dividerText: {
    marginHorizontal: 8,
    fontSize: 14,
    color: colors.slightlyTransparentText,
  },
  normalTransparentText: {
    marginHorizontal: 8,
    fontSize: 14,
    color: colors.slightlyTransparentText,
    margin: 0,
    padding: 0,
  },
  normalText: {
    marginHorizontal: 8,
    fontSize: 14,
    color: colors.normalText,
    margin: 0,
    padding: 0,
  },
  checkboxContainer: {
    padding: 4,
  },
  checkbox: {
    height: 16,
    width: 16,
    borderRadius: 8,
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
