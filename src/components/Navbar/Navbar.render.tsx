import {
  ButtonContainer,
  ButtonText,
  GradientContainer,
  MainContainer,
} from './Navbar.style.tsx';
import { navigationButtons } from '../../constants/navigation.tsx';
import { opacities } from '../../constants/styling.tsx';

const Navbar = ({ navigation, route }: { navigation: any; route: any }) => {
  const currentScreen = route.name;

  const handleTabClick = (screenName: string) => {
    console.log(screenName);
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
    </GradientContainer>
  );
};

export default Navbar;
