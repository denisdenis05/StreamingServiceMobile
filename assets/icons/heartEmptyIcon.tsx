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

const HeartEmptyIcon: React.FC<IconProps> = ({
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
      <G filter="url(#filter0_d_5_443)">
        <Path
          d="M16.4583 8.33325C10.1302 8.33325 5 13.4635 5 19.7916C5 31.2499 18.5417 41.6666 25.8333 44.0895C33.125 41.6666 46.6667 31.2499 46.6667 19.7916C46.6667 13.4635 41.5365 8.33325 35.2083 8.33325C31.3333 8.33325 27.9063 10.2572 25.8333 13.202C24.7766 11.6972 23.3729 10.4691 21.741 9.62161C20.1091 8.77413 18.2971 8.33221 16.4583 8.33325Z"
          stroke={fill}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M16.458 9.33325H16.459C18.1371 9.33232 19.791 9.73559 21.2803 10.509C22.7695 11.2824 24.0502 12.4034 25.0146 13.7766C25.2018 14.0431 25.5074 14.2022 25.833 14.2024C26.1585 14.2025 26.464 14.0438 26.6514 13.7776C28.5449 11.0878 31.6722 9.33336 35.208 9.33325C40.9837 9.33325 45.6668 14.0156 45.667 19.7913C45.667 25.1363 42.4918 30.3652 38.2734 34.6252C34.1905 38.7484 29.2895 41.8004 25.833 43.0315C22.3765 41.8002 17.4753 38.7483 13.3926 34.6252C9.17423 30.3652 6 25.1363 6 19.7913C6.00018 14.0157 10.6824 9.33343 16.458 9.33325Z"
          stroke={fill}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
      <Defs>
        <Filter
          id="filter0_d_5_443"
          x="-3.16675"
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
            result="effect1_dropShadow_5_443"
          />
          <FeBlend
            in="SourceGraphic"
            in2="effect1_dropShadow_5_443"
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

export default HeartEmptyIcon;
