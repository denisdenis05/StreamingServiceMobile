import React from 'react';
import { TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface IconProps {
  width?: number;
  height?: number;
  onPress?: () => void;
  style?: any;
}

const GoogleLogoIcon: React.FC<IconProps> = ({
  width = 23,
  height = 22,
  onPress,
  style,
}) => {
  const Icon = (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 23 22"
      fill="none"
      style={style}
    >
      <Path
        d="M21.1259 11.2137C21.1259 10.4224 21.0604 9.84485 20.9186 9.24597H11.6974V12.8179H17.11C17.001 13.7055 16.4117 15.0424 15.1021 15.9406L15.0838 16.0602L17.9993 18.2737L18.2013 18.2935C20.0565 16.6144 21.1259 14.144 21.1259 11.2137Z"
        fill="#4285F4"
      />
      <Path
        d="M11.6968 20.625C14.3485 20.625 16.5747 19.7694 18.2007 18.2936L15.1015 15.9408C14.2722 16.5076 13.1591 16.9033 11.6968 16.9033C9.09961 16.9033 6.89527 15.2243 6.10948 12.9036L5.9943 12.9131L2.96265 15.2125L2.923 15.3205C4.53806 18.4647 7.85552 20.625 11.6968 20.625Z"
        fill="#34CAA5"
      />
      <Path
        d="M6.11006 12.9036C5.90272 12.3047 5.78273 11.663 5.78273 11C5.78273 10.3369 5.90272 9.69524 6.09915 9.09636L6.09366 8.96881L3.024 6.63257L2.92357 6.67938C2.25792 7.98412 1.87598 9.44929 1.87598 11C1.87598 12.5507 2.25792 14.0158 2.92357 15.3205L6.11006 12.9036Z"
        fill="#FDCF24"
      />
      <Path
        d="M11.6969 5.09664C13.5411 5.09664 14.7851 5.87733 15.4945 6.52974L18.2663 3.8775C16.5639 2.32681 14.3486 1.375 11.6969 1.375C7.85554 1.375 4.53807 3.53526 2.923 6.6794L6.09859 9.09638C6.89529 6.77569 9.09964 5.09664 11.6969 5.09664Z"
        fill="#EB4335"
      />
    </Svg>
  );

  return onPress ? (
    <TouchableOpacity onPress={onPress}>{Icon}</TouchableOpacity>
  ) : (
    Icon
  );
};

export default GoogleLogoIcon;
