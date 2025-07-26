import React from 'react';
import { TouchableOpacity } from 'react-native';
import Svg, { G, Path, Defs, ClipPath, Rect } from 'react-native-svg';

interface SearchIconProps {
  width?: number;
  height?: number;
  fill?: string;
  onPress?: () => void;
  style?: any;
}

const SearchIcon: React.FC<SearchIconProps> = ({
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
      <G clipPath="url(#clip0_3_24)">
        <Path
          d="M22.6906 45.3812C16.4886 45.3812 11.2403 43.2327 6.94552 38.9357C2.65078 34.6387 0.502278 29.3903 0.500002 23.1906C0.497726 16.9909 2.64623 11.7425 6.94552 7.44552C11.2448 3.14851 16.4932 1 22.6906 1C28.8881 1 34.1376 3.14851 38.4391 7.44552C42.7407 11.7425 44.8881 16.9909 44.8812 23.1906C44.8812 25.6942 44.4829 28.0555 43.6863 30.2745C42.8898 32.4936 41.8087 34.4566 40.4431 36.1636L59.5612 55.2816C60.187 55.9075 60.5 56.7041 60.5 57.6714C60.5 58.6387 60.187 59.4353 59.5612 60.0612C58.9353 60.687 58.1387 61 57.1714 61C56.2041 61 55.4075 60.687 54.7817 60.0612L35.6636 40.9431C33.9566 42.3087 31.9936 43.3898 29.7745 44.1863C27.5555 44.9829 25.1942 45.3812 22.6906 45.3812ZM22.6906 38.5533C26.958 38.5533 30.5859 37.0603 33.5743 34.0743C36.5626 31.0882 38.0556 27.4603 38.0533 23.1906C38.0511 18.9209 36.558 15.2942 33.5743 12.3104C30.5905 9.3266 26.9626 7.83243 22.6906 7.82788C18.4186 7.82333 14.7919 9.3175 11.8104 12.3104C8.82888 15.3033 7.33471 18.93 7.32788 23.1906C7.32105 27.4512 8.81522 31.0791 11.8104 34.0743C14.8055 37.0694 18.4323 38.5624 22.6906 38.5533Z"
          fill={fill}
        />
      </G>
      <Defs>
        <ClipPath id="clip0_3_24">
          <Rect
            width="61"
            height="60"
            fill="white"
            transform="translate(0.4375 0.71875)"
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

export default SearchIcon;
