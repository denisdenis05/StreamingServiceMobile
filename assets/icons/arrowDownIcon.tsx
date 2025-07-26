import React from 'react';
import { TouchableOpacity } from 'react-native';
import Svg, { G, Path, Defs, ClipPath, Rect } from 'react-native-svg';

interface ArrowDownIconProps {
  width?: number;
  height?: number;
  fill?: string;
  onPress?: () => void;
  style?: any;
}

const ArrowDownIcon: React.FC<ArrowDownIconProps> = ({
  width = 51,
  height = 50,
  fill = 'white',
  onPress,
  style,
}) => {
  const IconComponent = (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 51 50"
      fill="none"
      style={style}
    >
      <G clipPath="url(#clip0)">
        <Path
          d="M1.60058 11.2102C2.30549 10.5055 3.26143 10.1096 4.25817 10.1096C5.25492 10.1096 6.21086 10.5055 6.91577 11.2102L25.5227 29.8171L44.1296 11.2102C44.8386 10.5255 45.7881 10.1466 46.7737 10.1551C47.7593 10.1637 48.7021 10.559 49.399 11.256C50.096 11.9529 50.4913 12.8957 50.4999 13.8813C50.5084 14.8669 50.1295 15.8164 49.4448 16.5254L28.1803 37.7899C27.4754 38.4946 26.5194 38.8905 25.5227 38.8905C24.5259 38.8905 23.57 38.4946 22.8651 37.7899L1.60058 16.5254C0.895878 15.8205 0.5 14.8645 0.5 13.8678C0.5 12.871 0.895878 11.9151 1.60058 11.2102Z"
          fill={fill}
        />
      </G>
      <Defs>
        <ClipPath id="clip0">
          <Rect
            width="50"
            height="50"
            fill="white"
            transform="translate(0.5)"
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

export default ArrowDownIcon;
