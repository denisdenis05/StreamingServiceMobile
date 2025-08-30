import React from 'react';
import {
  ContentContainer,
  Title,
  CenteredContainer,
  Subtitle,
  StyledInput,
  LoginButton,
  ButtonText,
  HeaderContainer,
  LoginDivider,
  RemmeberMe,
  SwitchCard,
} from './Login.style.tsx';
import {
  LOGINPAGE_DIVIDER_SIGNIN_TEXT,
  LOGINPAGE_DIVIDER_SIGNUP_TEXT,
  LOGINPAGE_HEADER_SUBTITLE,
  LOGINPAGE_HEADER_TITLE,
  SWITCH_TO_LOGIN_BUTTON_TEXT,
  SWITCH_TO_LOGIN_TEXT,
  SWITCH_TO_REGISTER_BUTTON_TEXT,
  SWITCH_TO_REGISTER_TEXT,
} from '../../constants/texts.tsx';
import GoogleIcon from '../../../assets/icons/google.tsx';
import Toast from 'react-native-toast-message';
import { useApi } from '../../hooks/useApi.ts';
import {
  isValidEmail,
  isValidPassword,
} from '../../services/Authentication.ts';

const LoginCard: React.FC<{
  username: string;
  setUsername: (u: string) => void;
  password: string;
  setPassword: (p: string) => void;
  rememberMe: boolean;
  setRememberMe: (v: boolean) => void;
  handleLogin: () => void;
  handleGoogleLogin: () => void;
  switchLoginType: () => void;
}> = ({
  username,
  setUsername,
  password,
  setPassword,
  rememberMe,
  setRememberMe,
  handleLogin,
  handleGoogleLogin,
  switchLoginType,
}) => (
  <CenteredContainer>
    <StyledInput
      value={username}
      onChangeText={setUsername}
      placeholder="Username or email"
    />
    <StyledInput
      value={password}
      onChangeText={setPassword}
      placeholder="Password"
    />
    <RemmeberMe isChecked={rememberMe} setIsChecked={setRememberMe} />
    <LoginButton onPress={handleLogin}>
      <ButtonText>Login</ButtonText>
    </LoginButton>
    <LoginDivider>{LOGINPAGE_DIVIDER_SIGNIN_TEXT}</LoginDivider>
    <LoginButton onPress={handleGoogleLogin}>
      <GoogleIcon />
      <ButtonText>Google</ButtonText>
    </LoginButton>
    <SwitchCard
      onPress={switchLoginType}
      text={SWITCH_TO_REGISTER_TEXT}
      buttonText={SWITCH_TO_REGISTER_BUTTON_TEXT}
    />
  </CenteredContainer>
);

const RegisterCard = ({
  username,
  setUsername,
  email,
  setEmail,
  password,
  setPassword,
  handleRegister,
  handleGoogleLogin,
  switchLoginType,
}: any) => {
  return (
    <CenteredContainer>
      <StyledInput
        value={username}
        onChangeText={setUsername}
        placeholder={'Username'}
      />
      <StyledInput
        value={email}
        onChangeText={setEmail}
        placeholder={'Email'}
      />
      <StyledInput
        value={password}
        onChangeText={setPassword}
        placeholder={'Password'}
      />
      <LoginButton onPress={handleRegister}>
        <ButtonText>Create account</ButtonText>
      </LoginButton>
      <LoginDivider>{LOGINPAGE_DIVIDER_SIGNUP_TEXT}</LoginDivider>
      <LoginButton onPress={handleGoogleLogin}>
        <GoogleIcon />
        <ButtonText>Google</ButtonText>
      </LoginButton>
      <SwitchCard
        onPress={switchLoginType}
        text={SWITCH_TO_LOGIN_TEXT}
        buttonText={SWITCH_TO_LOGIN_BUTTON_TEXT}
      />
    </CenteredContainer>
  );
};
const Login = () => {
  const api = useApi();
  const [username, setUsername] = React.useState<string>('');
  const [email, setEmail] = React.useState<string>('');
  const [password, setPassword] = React.useState<string>('');
  const [rememberMe, setRememberMe] = React.useState<boolean>(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loginType, setLoginType] = React.useState(false);

  const handleLogin = async () => {
    if (isLoading) return;

    setIsLoading(true);

    const url = 'authentication/login';

    const data = {
      emailOrUsername: username,
      password: password,
      keepMeLoggedIn: rememberMe,
    };

    try {
      const response = await api.post(url, data);
      if (response.status === 200 || response.status === 201) {
        Toast.show({ type: 'message', text1: 'Logging you in...' });
      }
    } catch (error) {
      Toast.show({
        type: 'message',
        text1: 'Incorrect username/email or password',
      });
    }

    setIsLoading(false);
  };

  const handleRegister = async () => {
    if (isLoading) return;

    if (!isValidEmail(email!)) {
      Toast.show({ type: 'message', text1: 'Invalid email format!' });
      return;
    }

    if (!isValidPassword(password!)) {
      Toast.show({
        type: 'message',
        text1:
          'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.',
      });
      return;
    }

    setIsLoading(true);

    const url = 'authentication/register';

    const data = {
      email: email,
      username: username,
      password: password,
    };

    try {
      const response = await api.post(url, data);
      if (response.status === 200 || response.status === 201) {
        Toast.show({
          type: 'message',
          text1: 'Account created! Logging you in...',
        });
      }
    } catch {}

    setIsLoading(false);
  };

  const handleGoogleLogin = () => {
    Toast.show({ type: 'message', text1: 'Not implemented yet' });
  };

  const switchLoginType = () => {
    setLoginType(!loginType);
  };

  return (
    <ContentContainer>
      <HeaderContainer>
        <Title>{LOGINPAGE_HEADER_TITLE}</Title>
        <Subtitle>{LOGINPAGE_HEADER_SUBTITLE}</Subtitle>
      </HeaderContainer>
      {loginType ? (
        <RegisterCard
          username={username}
          setUsername={setUsername}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          handleRegister={handleRegister}
          handleGoogleLogin={handleGoogleLogin}
          switchLoginType={switchLoginType}
        />
      ) : (
        <LoginCard
          username={username}
          setUsername={setUsername}
          password={password}
          setPassword={setPassword}
          rememberMe={rememberMe}
          setRememberMe={setRememberMe}
          handleLogin={handleLogin}
          handleGoogleLogin={handleGoogleLogin}
          switchLoginType={switchLoginType}
        />
      )}
    </ContentContainer>
  );
};

export default Login;
