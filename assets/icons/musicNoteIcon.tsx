import React from 'react';
import { TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface MusicNoteIconProps {
  width?: number;
  height?: number;
  fill?: string;
  onPress?: () => void;
  style?: any;
}

const MusicNoteIcon: React.FC<MusicNoteIconProps> = ({
  width = 46,
  height = 46,
  fill = 'white',
  onPress,
  style,
}) => {
  const IconComponent = (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 46 46"
      fill="none"
      style={style}
    >
      <Path
        d="M11.5 35.5983C15.7282 35.5983 19.1667 32.1598 19.1667 27.9316V8.48704L36.4167 14.7584V28.9992C35.257 28.3079 33.9335 27.9393 32.5834 27.9316C28.3552 27.9316 24.9167 31.3701 24.9167 35.5983C24.9167 39.8265 28.3552 43.265 32.5834 43.265C36.8115 43.265 40.25 39.8265 40.25 35.5983V13.4167C40.2498 13.0236 40.1286 12.6401 39.903 12.3181C39.6774 11.9962 39.3583 11.7514 38.9889 11.617L17.9055 3.95029C17.6161 3.84495 17.3055 3.81092 17.0002 3.85107C16.6948 3.89123 16.4036 4.00439 16.1512 4.18097C15.8989 4.35755 15.6928 4.59235 15.5504 4.86548C15.408 5.13862 15.3336 5.44203 15.3334 5.75004V21.3325C14.1736 20.6412 12.8502 20.2726 11.5 20.265C7.27187 20.265 3.83337 23.7035 3.83337 27.9316C3.83337 32.1598 7.27187 35.5983 11.5 35.5983Z"
        fill={fill}
      />
    </Svg>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {IconComponent}
      </TouchableOpacity>
    );
  }

  return IconComponent;
};

export default MusicNoteIcon;
