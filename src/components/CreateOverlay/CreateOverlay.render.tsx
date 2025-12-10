import { ActionItem, MainContainer } from './CreateOverlay.style.tsx';
import React from 'react';
import MusicNoteIcon from '../../../assets/icons/musicNoteIcon.tsx';

const CreateOverlay = ({ navigation }: { navigation: any }) => {
  const handleClick = () => {
    navigation.navigate('CreatePlaylist');
  };

  return (
    <MainContainer onPress={handleClick}>
      <ActionItem onPress={handleClick} icon={MusicNoteIcon} />
    </MainContainer>
  );
};

export default CreateOverlay;
