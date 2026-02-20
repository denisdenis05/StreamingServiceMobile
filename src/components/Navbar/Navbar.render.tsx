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
import CreateOverlay from '../CreateOverlay';
import { useState } from 'react';

import { CommonActions } from '@react-navigation/native';

const Navbar = ({ navigation, route }: { navigation: any; route: any }) => {
  const currentScreen = route.name;
  const { queueLength } = useMusicQueue();
  const [pressedCreate, setPressedCreate] = useState(false);

  const handleTabClick = (screenName: string) => {
    if (screenName === 'Create') {
      setPressedCreate(!pressedCreate);
      return;
    }
    if (screenName === currentScreen) {
      return;
    }
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: screenName }],
      })
    );
  };

  return (
    <>
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
      {queueLength > 0 && <PlayingOverlay navigation={navigation} />}
      {pressedCreate && <CreateOverlay navigation={navigation} />}
    </>
  );
};

export default Navbar;
