import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet } from 'react-native';
import {
  BackdropContainer,
  CardTitle,
  CenteredContainer,
  ContentContainer,
  DragIndicator,
} from './CreatePlaylist.style.tsx';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const CreatePlaylist = ({ navigation }: any) => {
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) =>
      gestureState.dy > 0 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        translateY.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 100 || gestureState.vy > 0.5) {
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 300,
          useNativeDriver: true,
        }).start(() => navigation.goBack());
      } else {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    },
  });

  useEffect(() => {
    translateY.setValue(SCREEN_HEIGHT);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <BackdropContainer>
      <Animated.View
        style={[styles.container, { transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        <ContentContainer>
          <DragIndicator />
          <CenteredContainer>
            <CardTitle>Give your playlist a name</CardTitle>
          </CenteredContainer>
        </ContentContainer>
      </Animated.View>
    </BackdropContainer>
  );
};

export default CreatePlaylist;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 60,
  },
});
