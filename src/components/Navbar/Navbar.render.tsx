import {
  ButtonContainer,
  ButtonText,
  GradientContainer,
  IconPill,
  MainContainer,
} from './Navbar.style.tsx';
import { navigationButtons } from '../../constants/navigation.tsx';
import { colors, iconSizes, sizes } from '../../constants/styling.tsx';
import PlayingOverlay from '../PlayingOverlay';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import CreateOverlay from '../CreateOverlay';
import { useState } from 'react';

const Navbar = ({ navigation, route }: { navigation: any; route: any }) => {
  const currentScreen = route.name;
  const { currentTrack } = useMusicQueue();
  const [pressedCreate, setPressedCreate] = useState(false);
  const [navbarHeight, setNavbarHeight] = useState(sizes.navbarHeight);

  const handleTabClick = (screenName: string) => {
    if (screenName === 'Create') {
      setPressedCreate(!pressedCreate);
      return;
    }
    if (screenName === currentScreen) {
      return;
    }
    navigation.navigate(screenName);
  };

  return (
    <>
      <GradientContainer onLayout={e => setNavbarHeight(e.nativeEvent.layout.height)}>
        <MainContainer>
          {navigationButtons.map(button => {
            const isActive = currentScreen === button.label;
            const iconFill = isActive ? '#FFFFFF' : colors.normalText;
            const pillStyle = isActive
              ? { backgroundColor: colors.accentPrimary }
              : undefined;
            const textStyle = isActive
              ? { color: colors.accentPrimary as string }
              : undefined;
            return (
              <ButtonContainer
                key={button.label}
                onPress={() => handleTabClick(button.label)}
              >
                <IconPill style={pillStyle}>
                  <button.icon height={iconSizes.md} fill={iconFill} />
                </IconPill>
                <ButtonText style={textStyle}>{button.label}</ButtonText>
              </ButtonContainer>
            );
          })}
        </MainContainer>
      </GradientContainer>
      {currentTrack !== null && <PlayingOverlay navigation={navigation} bottomOffset={navbarHeight + 6} />}
      {pressedCreate && <CreateOverlay navigation={navigation} />}
    </>
  );
};

export default Navbar;
