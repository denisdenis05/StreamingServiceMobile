import React from 'react';
import { TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface IconProps {
  width?: number;
  height?: number;
  fill?: string;
  onPress?: () => void;
  style?: any;
}

const PlayIcon: React.FC<IconProps> = ({
  width = 50,
  height = 50,
  fill = 'white',
  onPress,
  style,
}) => {
  const Icon = (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 50 50"
      fill="none"
      style={style}
    >
      <Path
        d="M44.602 19.4854C45.6026 20.0175 46.4396 20.8118 47.0233 21.7833C47.6069 22.7547 47.9153 23.8667 47.9153 25C47.9153 26.1333 47.6069 27.2452 47.0233 28.2167C46.4396 29.1881 45.6026 29.9825 44.602 30.5146L17.9103 45.0292C13.6124 47.3687 8.33325 44.3271 8.33325 39.5167V10.4854C8.33325 5.67291 13.6124 2.63332 17.9103 4.96874L44.602 19.4854Z"
        fill={fill}
      />
    </Svg>
  );

  return onPress ? (
    <TouchableOpacity onPress={onPress}>{Icon}</TouchableOpacity>
  ) : (
    Icon
  );
};

export default PlayIcon;
