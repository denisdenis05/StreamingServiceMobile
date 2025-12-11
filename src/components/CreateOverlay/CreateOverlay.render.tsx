import { ActionItem, MainContainer } from './CreateOverlay.style.tsx';
import React from 'react';
import { ActionItem as ActionItemType, createActionButtons } from '../../constants/navigation.tsx';

const CreateOverlay = ({
  navigation,
  menuOptions = createActionButtons,
  onClose,
  params,
}: {
  navigation: any;
  menuOptions?: ActionItemType[];
  onClose?: () => void;
  params?: any;
}) => {
  return (
    <MainContainer>
      {menuOptions.map((value, index) => {
        return (
          <ActionItem
            key={index}
            text={value.label}
            onPress={() => {
              value.onClick(navigation, params);
              if (onClose) onClose();
            }}
            icon={value.icon}
          />
        );
      })}
    </MainContainer>
  );
};

export default CreateOverlay;
