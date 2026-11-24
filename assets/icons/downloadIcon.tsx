import React from 'react';
import { TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface DownloadIconProps {
  width?: number;
  height?: number;
  fill?: string;
  onPress?: () => void;
  style?: any;
}

const DownloadIcon: React.FC<DownloadIconProps> = ({
  width = 75,
  height = 75,
  fill = 'white',
  onPress,
  style,
}) => {
  const IconComponent = (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 75 75"
      fill="none"
      style={style}
    >
      <Path
        d="M37.5 0C16.7894 0 0 16.7894 0 37.5C0 58.2106 16.7894 75 37.5 75C58.2106 75 75 58.2106 75 37.5C75 16.7894 58.2106 0 37.5 0ZM37.5 66.8478C21.2894 66.8478 8.15219 53.7065 8.15219 37.5C8.15219 21.2935 21.2894 8.15219 37.5 8.15219C53.7106 8.15219 66.8478 21.2935 66.8478 37.5C66.8478 53.7065 53.7106 66.8478 37.5 66.8478ZM44.837 21.8071H30.163V38.4782H20.9919L37.5 54.0081L54.0081 38.4782H44.837V21.8071Z"
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

export default DownloadIcon;
