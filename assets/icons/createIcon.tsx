import React from 'react';
import { TouchableOpacity } from 'react-native';
import Svg, { G, Path, Defs, ClipPath, Rect } from 'react-native-svg';

interface PlusIconProps {
  width?: number;
  height?: number;
  fill?: string;
  onPress?: () => void;
  style?: any;
}

const PlusIcon: React.FC<PlusIconProps> = ({
  width = 62,
  height = 61,
  fill = 'white',
  onPress,
  style,
}) => {
  const IconComponent = (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 62 61"
      fill="none"
      style={style}
    >
      <G clipPath="url(#clip0_3_41)">
        <Path
          d="M53.125 23.5H38.125V8.5C38.125 6.51088 37.3348 4.60322 35.9283 3.1967C34.5218 1.79018 32.6141 1 30.625 1C28.6359 1 26.7282 1.79018 25.3217 3.1967C23.9152 4.60322 23.125 6.51088 23.125 8.5L23.3913 23.5H8.125C6.13588 23.5 4.22822 24.2902 2.8217 25.6967C1.41518 27.1032 0.625 29.0109 0.625 31C0.625 32.9891 1.41518 34.8968 2.8217 36.3033C4.22822 37.7098 6.13588 38.5 8.125 38.5L23.3913 38.2337L23.125 53.5C23.125 55.4891 23.9152 57.3968 25.3217 58.8033C26.7282 60.2098 28.6359 61 30.625 61C32.6141 61 34.5218 60.2098 35.9283 58.8033C37.3348 57.3968 38.125 55.4891 38.125 53.5V38.2337L53.125 38.5C55.1141 38.5 57.0218 37.7098 58.4283 36.3033C59.8348 34.8968 60.625 32.9891 60.625 31C60.625 29.0109 59.8348 27.1032 58.4283 25.6967C57.0218 24.2902 55.1141 23.5 53.125 23.5Z"
          fill={fill}
        />
      </G>
      <Defs>
        <ClipPath id="clip0_3_41">
          <Rect
            width="61"
            height="60"
            fill="white"
            transform="translate(0.5625 0.71875)"
          />
        </ClipPath>
      </Defs>
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

export default PlusIcon;
