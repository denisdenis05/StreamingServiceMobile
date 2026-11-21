import React, { memo, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { moderateScale } from '../../utils/scaling';
import { PlayingCardLayout } from '../../constants/playingLayout';
import { fonts } from '../../constants/styling';
import {
  activeLyricsLine,
  centeredLyricsOffset,
  compactLyricsAnchor,
  LyricsDocument,
  LyricsPolicy,
} from '../../services/lyrics/LyricsDocument';
import { LyricsPanelPolicy } from './LyricsPanelPolicy';

interface LyricsPanelProps {
  readonly document: LyricsDocument | null;
  readonly positionMilliseconds: number;
  readonly backgroundColor: string;
  readonly expanded: boolean;
  readonly onExpand: () => void;
  readonly onMinimize: () => void;
  readonly onSeek: (seconds: number) => void;
  readonly seekEnabled: boolean;
  readonly message: string | null;
  readonly onRetry: () => void;
  readonly retryable: boolean;
}
interface LineLayout {
  readonly top: number;
  readonly height: number;
}
function LyricsPanelContent(properties: LyricsPanelProps) {
  const { document, expanded } = properties;
  const activeIndex = activeLyricsLine(
    document,
    properties.positionMilliseconds,
  );
  const viewport = useRef<ScrollView>(null);
  const layouts = useRef(new Map<number, LineLayout>());
  const latestDocument = useRef(document);
  const documentRevision = useRef<number>(LyricsPanelPolicy.noOffset);
  if (latestDocument.current !== document) {
    layouts.current.clear();
    documentRevision.current += LyricsPolicy.indexIncrement;
    latestDocument.current = document;
  }
  const [viewportHeight, setViewportHeight] = useState<number>(
    LyricsPanelPolicy.noOffset,
  );
  const [contentHeight, setContentHeight] = useState<number>(
    LyricsPanelPolicy.noOffset,
  );
  const [layoutRevision, setLayoutRevision] = useState<number>(
    LyricsPanelPolicy.noOffset,
  );
  const manuallyScrolled = useRef(false);
  const initialPosition = useRef(true);
  useEffect(() => {
    manuallyScrolled.current = false;
    initialPosition.current = true;
  }, [expanded, document]);
  useEffect(() => {
    if (!expanded) return;
    const subscription = BackHandler.addEventListener(
      LyricsPanelPolicy.backEvent,
      () => true,
    );
    return () => subscription.remove();
  }, [expanded]);
  useEffect(() => {
    if (
      (expanded && manuallyScrolled.current) ||
      viewportHeight <= LyricsPanelPolicy.noOffset
    )
      return;
    const anchor = expanded
      ? Math.max(LyricsPolicy.initialIndex, activeIndex)
      : compactLyricsAnchor(activeIndex);
    const layout = layouts.current.get(anchor);
    if (layout === undefined) return;
    const offset = expanded
      ? centeredLyricsOffset(
          layout.top,
          layout.height,
          viewportHeight,
          contentHeight,
        )
      : layout.top;
    viewport.current?.scrollTo({
      y: offset,
      animated: !initialPosition.current,
    });
    initialPosition.current = false;
  }, [
    activeIndex,
    expanded,
    viewportHeight,
    contentHeight,
    layoutRevision,
    document,
  ]);
  const lineLayout = (index: number, event: LayoutChangeEvent) => {
    const { y: top, height } = event.nativeEvent.layout;
    const previous = layouts.current.get(index);
    if (previous?.top === top && previous.height === height) return;
    layouts.current.set(index, { top, height });
    setLayoutRevision(revision => revision + LyricsPolicy.indexIncrement);
  };
  const seek = (index: number) => {
    const timestamp = document?.lines[index]?.timestampMilliseconds;
    if (
      timestamp === null ||
      timestamp === undefined ||
      !properties.seekEnabled
    )
      return;
    properties.onSeek(timestamp / LyricsPolicy.millisecondsPerSecond);
    if (!expanded) properties.onExpand();
  };
  return (
    <View
      testID={
        expanded
          ? LyricsPanelPolicy.expandedTestIdentifier
          : LyricsPanelPolicy.panelTestIdentifier
      }
      style={[
        styles.panel,
        expanded ? styles.expanded : styles.compact,
        { backgroundColor: properties.backgroundColor },
      ]}
    >
      <Pressable
        testID={LyricsPanelPolicy.headerTestIdentifier}
        style={[styles.header, expanded && styles.expandedHeader]}
        accessible={false}
        onPress={expanded ? undefined : properties.onExpand}
      >
        <Text style={styles.title}>{LyricsPanelPolicy.title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            expanded
              ? LyricsPanelPolicy.minimizeLabel
              : LyricsPanelPolicy.expandLabel
          }
          onPress={expanded ? properties.onMinimize : properties.onExpand}
          style={styles.iconTarget}
        >
          <Svg
            width={LyricsPanelPolicy.iconSize}
            height={LyricsPanelPolicy.iconSize}
            viewBox={LyricsPanelPolicy.iconViewBox}
          >
            <Path
              d={
                expanded
                  ? LyricsPanelPolicy.minimizePath
                  : LyricsPanelPolicy.expandPath
              }
              stroke={LyricsPanelPolicy.activeText}
              strokeWidth={LyricsPanelPolicy.iconStrokeWidth}
              fill={LyricsPanelPolicy.noFill}
            />
          </Svg>
        </Pressable>
      </Pressable>
      <Pressable
        style={styles.body}
        accessible={false}
        onPress={expanded ? undefined : properties.onExpand}
      >
        {document === null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={LyricsPanelPolicy.retryLabel}
            disabled={!properties.retryable}
            onPress={properties.onRetry}
            style={styles.empty}
          >
            <Text style={styles.message}>{properties.message}</Text>
          </Pressable>
        ) : (
          <ScrollView
            key={JSON.stringify([expanded, documentRevision.current])}
            ref={viewport}
            testID={LyricsPanelPolicy.viewportTestIdentifier}
            scrollEnabled={expanded}
            bounces={expanded}
            scrollsToTop={expanded}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={expanded}
            onScrollBeginDrag={() => {
              if (expanded) manuallyScrolled.current = true;
            }}
            onLayout={event =>
              setViewportHeight(event.nativeEvent.layout.height)
            }
            onContentSizeChange={(_width, height) => setContentHeight(height)}
            contentContainerStyle={[
              styles.lines,
              !expanded && {
                paddingBottom: Math.max(
                  LyricsPanelPolicy.textInset,
                  viewportHeight,
                ),
              },
            ]}
            scrollEventThrottle={LyricsPanelPolicy.scrollThrottleMilliseconds}
          >
            {document.lines.map((line, index) => (
              <LyricRow
                key={String(index)}
                text={line.text}
                active={index === activeIndex}
                seekable={
                  properties.seekEnabled && line.timestampMilliseconds !== null
                }
                onPress={() => seek(index)}
                onLayout={event => lineLayout(index, event)}
                index={index}
              />
            ))}
          </ScrollView>
        )}
      </Pressable>
    </View>
  );
}
export const LyricsPanel = memo(LyricsPanelContent, (previous, next) => {
  const { positionMilliseconds: previousPosition, ...previousProperties } =
    previous;
  const { positionMilliseconds: nextPosition, ...nextProperties } = next;
  return (
    activeLyricsLine(previous.document, previousPosition) ===
      activeLyricsLine(next.document, nextPosition) &&
    (
      Object.keys(previousProperties) as (keyof typeof previousProperties)[]
    ).every(
      property => previousProperties[property] === nextProperties[property],
    )
  );
});
function LyricRow({
  text,
  active,
  seekable,
  onPress,
  onLayout,
  index,
}: {
  readonly text: string;
  readonly active: boolean;
  readonly seekable: boolean;
  readonly onPress: () => void;
  readonly onLayout: (event: LayoutChangeEvent) => void;
  readonly index: number;
}) {
  const emphasis = useRef(
    new Animated.Value(
      active
        ? LyricsPanelPolicy.activeProgress
        : LyricsPanelPolicy.inactiveProgress,
    ),
  ).current;
  useEffect(() => {
    const animation = Animated.timing(emphasis, {
      toValue: active
        ? LyricsPanelPolicy.activeProgress
        : LyricsPanelPolicy.inactiveProgress,
      duration: LyricsPanelPolicy.transitionMilliseconds,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [active, emphasis]);
  return (
    <Pressable
      testID={LyricsPanelPolicy.lineTestPrefix + index}
      onLayout={onLayout}
      onPress={onPress}
      disabled={!seekable}
      accessibilityRole={seekable ? 'button' : 'text'}
      accessibilityState={{ selected: active }}
      style={styles.row}
    >
      <Animated.Text
        style={[
          styles.line,
          {
            color: emphasis.interpolate({
              inputRange: [
                LyricsPanelPolicy.inactiveProgress,
                LyricsPanelPolicy.activeProgress,
              ],
              outputRange: [
                LyricsPanelPolicy.normalText,
                LyricsPanelPolicy.activeText,
              ],
            }),
            transform: [
              {
                scale: emphasis.interpolate({
                  inputRange: [
                    LyricsPanelPolicy.inactiveProgress,
                    LyricsPanelPolicy.activeProgress,
                  ],
                  outputRange: [
                    LyricsPanelPolicy.normalFontSize /
                      LyricsPanelPolicy.activeFontSize,
                    LyricsPanelPolicy.activeProgress,
                  ],
                }),
              },
            ],
          },
        ]}
      >
        {text || LyricsPanelPolicy.emptyLine}
      </Animated.Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  panel: { overflow: 'hidden' },
  compact: {
    height: moderateScale(LyricsPanelPolicy.cardHeight),
    paddingTop: LyricsPanelPolicy.compactTopInset,
    width: PlayingCardLayout.width,
    alignSelf: 'center',
    borderRadius: LyricsPanelPolicy.radius,
  },
  expanded: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: LyricsPanelPolicy.expandedInset,
    paddingHorizontal: LyricsPanelPolicy.expandedInset,
    paddingBottom: LyricsPanelPolicy.expandedInset,
  },
  header: {
    height: LyricsPanelPolicy.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: LyricsPanelPolicy.textInset,
  },
  expandedHeader: {
    marginBottom: moderateScale(LyricsPanelPolicy.expandedHeadingGap),
  },
  title: {
    fontWeight: '700',
    color: LyricsPanelPolicy.activeText,
    fontSize: moderateScale(LyricsPanelPolicy.headerFontSize),
    fontFamily: fonts.sansSerif,
  },
  iconTarget: {
    width: LyricsPanelPolicy.touchSize,
    height: LyricsPanelPolicy.touchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  lines: {
    paddingHorizontal: LyricsPanelPolicy.textInset,
    paddingBottom: LyricsPanelPolicy.textInset,
  },
  row: { paddingVertical: LyricsPanelPolicy.rowVerticalPadding },
  line: {
    fontFamily: fonts.sansSerif,
    fontWeight: '700',
    fontSize: moderateScale(LyricsPanelPolicy.activeFontSize),
    transformOrigin: 'left center',
    lineHeight: moderateScale(LyricsPanelPolicy.lineHeight),
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    padding: LyricsPanelPolicy.textInset,
  },
  message: {
    fontFamily: fonts.sansSerif,
    color: LyricsPanelPolicy.normalText,
    fontSize: moderateScale(LyricsPanelPolicy.normalFontSize),
  },
});
