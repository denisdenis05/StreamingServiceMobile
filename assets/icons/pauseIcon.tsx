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

const CustomDoubleBarsIcon: React.FC<IconProps> = ({
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
      xmlns="http://www.w3.org/2000/svg"
    >
      <Path
        d="M38.0555 46.6666C36.1457 46.6666 34.5115 46.0609 33.1527 44.8497C31.7939 43.6384 31.1133 42.1805 31.111 40.4761V9.52373C31.111 7.82135 31.7916 6.36453 33.1527 5.15326C34.5138 3.94199 36.148 3.33532 38.0555 3.33326C39.9629 3.33119 41.5983 3.93786 42.9617 5.15326C44.3251 6.36865 45.0045 7.82548 44.9999 9.52373V40.4761C44.9999 42.1785 44.3205 43.6363 42.9617 44.8497C41.6029 46.063 39.9675 46.6686 38.0555 46.6666ZM10.2777 46.6666C8.36797 46.6666 6.73371 46.0609 5.37492 44.8497C4.01612 43.6384 3.33557 42.1805 3.33325 40.4761V9.52373C3.33325 7.82135 4.01381 6.36453 5.37492 5.15326C6.73603 3.94199 8.37029 3.33532 10.2777 3.33326C12.1851 3.33119 13.8205 3.93786 15.1839 5.15326C16.5474 6.36865 17.2268 7.82548 17.2221 9.52373V40.4761C17.2221 42.1785 16.5427 43.6363 15.1839 44.8497C13.8251 46.063 12.1897 46.6686 10.2777 46.6666Z"
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

export default CustomDoubleBarsIcon;
