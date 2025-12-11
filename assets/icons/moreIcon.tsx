import React from 'react';
import { TouchableOpacity } from 'react-native';
import Svg, { G, Path, Defs, ClipPath, Rect } from 'react-native-svg';

interface MoreIconIconProps {
  width?: number;
  height?: number;
  fill?: string;
  onPress?: (event: any) => void;
  style?: any;
}

const MoreIcon: React.FC<MoreIconIconProps> = ({
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
          fillRule="evenodd"
          clipRule="evenodd"
          d="M6.75 18.75C8.4076 18.75 9.99731 19.4085 11.1694 20.5806C12.3415 21.7527 13 23.3424 13 25C13 26.6576 12.3415 28.2473 11.1694 29.4194C9.99731 30.5915 8.4076 31.25 6.75 31.25C5.0924 31.25 3.50269 30.5915 2.33058 29.4194C1.15848 28.2473 0.5 26.6576 0.5 25C0.5 23.3424 1.15848 21.7527 2.33058 20.5806C3.50269 19.4085 5.0924 18.75 6.75 18.75ZM44.25 18.75C45.9076 18.75 47.4973 19.4085 48.6694 20.5806C49.8415 21.7527 50.5 23.3424 50.5 25C50.5 26.6576 49.8415 28.2473 48.6694 29.4194C47.4973 30.5915 45.9076 31.25 44.25 31.25C42.5924 31.25 41.0027 30.5915 39.8306 29.4194C38.6585 28.2473 38 26.6576 38 25C38 23.3424 38.6585 21.7527 39.8306 20.5806C41.0027 19.4085 42.5924 18.75 44.25 18.75ZM26.065 18.75C27.7226 18.75 29.3123 19.4085 30.4844 20.5806C31.6565 21.7527 32.315 23.3424 32.315 25C32.315 26.6576 31.6565 28.2473 30.4844 29.4194C29.3123 30.5915 27.7226 31.25 26.065 31.25C24.4074 31.25 22.8177 30.5915 21.6456 29.4194C20.4735 28.2473 19.815 26.6576 19.815 25C19.815 23.3424 20.4735 21.7527 21.6456 20.5806C22.8177 19.4085 24.4074 18.75 26.065 18.75Z"
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

export default MoreIcon;
