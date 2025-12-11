import { ActionItem, MainContainer } from './CreateOverlay.style.tsx';
import React from 'react';
import { createActionButtons } from '../../constants/navigation.tsx';

const CreateOverlay = ({ navigation }: { navigation: any }) => {
  return (
    <MainContainer>
      {createActionButtons.map((value, index) => {
        return (
          <ActionItem
            key={index}
            text={value.label}
            onPress={() => {
              value.onClick(navigation);
            }}
            icon={value.icon}
          />
        );
      })}
    </MainContainer>
  );
};

export default CreateOverlay;
