import React from 'react';
import { TouchableOpacity } from 'react-native';
import Svg, {
  Path,
  G,
  Defs,
  Filter,
  FeFlood,
  FeColorMatrix,
  FeOffset,
  FeGaussianBlur,
  FeComposite,
  FeBlend,
} from 'react-native-svg';

interface IconProps {
  width?: number;
  height?: number;
  fill?: string;
  onPress?: () => void;
  style?: any;
}

const HeartIcon: React.FC<IconProps> = ({
  width = 52,
  height = 54,
  fill = 'white',
  onPress,
  style,
}) => {
  const Icon = (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 52 54"
      fill="none"
      style={style}
    >
      <G filter="url(#dropShadow)">
        <Path
          d="M16.6251 8.33325C10.297 8.33325 5.16675 13.4635 5.16675 19.7916C5.16675 31.2499 18.7084 41.6666 26.0001 44.0895C33.2917 41.6666 46.8334 31.2499 46.8334 19.7916C46.8334 13.4635 41.7032 8.33325 35.3751 8.33325C31.5001 8.33325 28.073 10.2572 26.0001 13.202C24.9433 11.6972 23.5396 10.4691 21.9077 9.62161C20.2759 8.77413 18.4639 8.33221 16.6251 8.33325Z"
          fill={fill}
          stroke={fill}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
      <Defs>
        <Filter
          id="dropShadow"
          x="-3"
          y="0"
          width="58"
          height="58"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <FeFlood floodOpacity="0" result="BackgroundImageFix" />
          <FeColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <FeOffset dy="4" />
          <FeGaussianBlur stdDeviation="2" />
          <FeComposite in2="hardAlpha" operator="out" />
          <FeColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"
          />
          <FeBlend
            in2="BackgroundImageFix"
            mode="normal"
            result="effect1_dropShadow"
          />
          <FeBlend
            in="SourceGraphic"
            in2="effect1_dropShadow"
            mode="normal"
            result="shape"
          />
        </Filter>
      </Defs>
    </Svg>
  );

  return onPress ? (
    <TouchableOpacity onPress={onPress}>{Icon}</TouchableOpacity>
  ) : (
    Icon
  );
};

export default HeartIcon;
