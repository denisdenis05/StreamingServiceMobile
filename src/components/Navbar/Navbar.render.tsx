import {
  ButtonContainer,
  ButtonText,
  GradientContainer,
  MainContainer,
} from './Navbar.style.tsx';
import { navigationButtons } from '../../constants/navigation.tsx';
import { opacities } from '../../constants/styling.tsx';
import PlayingOverlay from '../PlayingOverlay';
import { useMusicQueue } from '../../../MusicProvider.tsx';

const Navbar = ({ navigation, route }: { navigation: any; route: any }) => {
  const currentScreen = route.name;
  const { queueLength } = useMusicQueue();

  const handleTabClick = (screenName: string) => {
    navigation.navigate(screenName);
  };

  return (
    <GradientContainer>
      <MainContainer>
        {navigationButtons.map(button => {
          const isCurrent = currentScreen === button.label;
          const opacity = isCurrent
            ? opacities.full
            : opacities.slightlyTransparent;
          return (
            <ButtonContainer
              key={button.label}
              onPress={() => handleTabClick(button.label)}
              style={{ opacity }}
            >
              <button.icon height={30} />
              <ButtonText>{button.label}</ButtonText>
            </ButtonContainer>
          );
        })}
      </MainContainer>
      {queueLength > 0 && <PlayingOverlay navigation={navigation} />}
    </GradientContainer>
  );
};

export default Navbar;
