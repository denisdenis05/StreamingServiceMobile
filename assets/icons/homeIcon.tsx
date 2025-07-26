import React from 'react';
import { TouchableOpacity } from 'react-native';
import Svg, { G, Path, Defs, ClipPath, Rect } from 'react-native-svg';

interface HomeIconProps {
  width?: number;
  height?: number;
  fill?: string;
  onPress?: () => void;
  style?: any;
}

const HomeIcon: React.FC<HomeIconProps> = ({
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
      <G clipPath="url(#clip0_2_10)">
        <Path
          d="M0.375 53.8616V23.0045C0.375 21.9187 0.645687 20.8902 1.18706 19.9187C1.72844 18.9473 2.47442 18.1473 3.425 17.5187L26.3 2.09018C27.6344 1.17589 29.1594 0.71875 30.875 0.71875C32.5906 0.71875 34.1156 1.17589 35.45 2.09018L58.325 17.5187C59.2781 18.1473 60.0254 18.9473 60.5667 19.9187C61.1081 20.8902 61.3775 21.9187 61.375 23.0045V53.8616C61.375 55.7473 60.6277 57.3622 59.1332 58.7062C57.6387 60.0502 55.8443 60.721 53.75 60.7187H42.3125C41.2323 60.7187 40.3274 60.3896 39.598 59.7313C38.8685 59.073 38.5025 58.2593 38.5 57.2902V40.1473C38.5 39.1759 38.134 38.3622 37.402 37.7062C36.67 37.0502 35.7652 36.721 34.6875 36.7187H27.0625C25.9823 36.7187 25.0775 37.0479 24.348 37.7062C23.6185 38.3645 23.2525 39.1782 23.25 40.1473V57.2902C23.25 58.2616 22.884 59.0765 22.152 59.7347C21.42 60.393 20.5152 60.721 19.4375 60.7187H8C5.90312 60.7187 4.10871 60.0479 2.61675 58.7062C1.12479 57.3645 0.377542 55.7496 0.375 53.8616Z"
          fill={fill}
        />
      </G>
      <Defs>
        <ClipPath id="clip0_2_10">
          <Rect
            width="61"
            height="60"
            fill="white"
            transform="translate(0.375 0.71875)"
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

export default HomeIcon;
