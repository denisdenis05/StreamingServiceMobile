import React from 'react';
import { TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface ArrowLeftIconProps {
  width?: number;
  height?: number;
  fill?: string;
  onPress?: () => void;
  style?: any;
}

const ArrowLeftIcon: React.FC<ArrowLeftIconProps> = ({
  width = 50,
  height = 50,
  fill = 'white',
  onPress,
  style,
}) => {
  const IconComponent = (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 50 50"
      fill="none"
      style={style}
    >
      <Path
        d="M38.7898 1.10058C39.4945 1.80549 39.8904 2.76143 39.8904 3.75817C39.8904 4.75492 39.4945 5.71086 38.7898 6.41577L20.1829 25.0227L38.7898 43.6296C39.4745 44.3386 39.8534 45.2881 39.8449 46.2737C39.8363 47.2593 39.441 48.2021 38.744 48.899C38.0471 49.596 37.1043 49.9913 36.1187 49.9999C35.1331 50.0084 34.1836 49.6295 33.4746 48.9448L12.2101 27.6803C11.5054 26.9754 11.1095 26.0194 11.1095 25.0227C11.1095 24.0259 11.5054 23.07 12.2101 22.3651L33.4746 1.10058C34.1795 0.395878 35.1355 0 36.1322 0C37.129 0 38.0849 0.395878 38.7898 1.10058Z"
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

export default ArrowLeftIcon;
