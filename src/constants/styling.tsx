import { moderateScale } from '../utils/scaling';

export const fonts = {
  serif: 'Lora-Bold',
  sansSerif: 'Outfit-Regular',
};

export const colors = {
  background: '#EDE7E2',
  surfaceBase: '#EDE7E2',
  surfaceCard: '#F5F0EB',
  surfaceElevated: '#F9F6F3',
  secondaryBackground: '#E8E1DB',
  accentPrimary: '#3D5A3E',
  accentGreenHover: '#4A6E4B',
  borderSubtle: 'rgba(42, 36, 32, 0.08)',
  borderLight: 'rgba(42, 36, 32, 0.15)',
  navbarGradient: ['rgba(237,231,226,0)', 'rgba(237,231,226,0.85)', 'rgba(237,231,226,0.98)', '#EDE7E2'],
  normalText: '#2A2420',
  slightlyTransparentText: 'rgba(42, 36, 32, 0.55)',
  lowOpacityText: 'rgba(42, 36, 32, 0.15)',
  veryLowOpacityText: 'rgba(42, 36, 32, 0.06)',
  slightlyColoredText: '#5C4A3E',
  textOnAccent: '#FFFFFF',
  textOnAccentMuted: 'rgba(255, 255, 255, 0.75)',
};

export const typography = {
  pageTitle: moderateScale(26),     // page H1 — greeting, search title (Lora-Bold)
  sectionTitle: moderateScale(20),  // carousel / section headers (Lora-Bold)
  dialogTitle: moderateScale(22),   // modal / sheet titles (Lora-Bold)
  itemTitle: moderateScale(14),     // card and list-item primary text
  body: moderateScale(15),          // DefaultText base, menu items, buttons
  secondary: moderateScale(12),     // artist names, metadata, subtitles
  caption: moderateScale(11),       // timestamps, nav labels
  inputText: moderateScale(15),     // text-input fields
  navLabel: moderateScale(10),      // bottom-tab labels
};

export const iconSizes = {
  lg: 28,   // main playback controls (play, pause, skip, shuffle, repeat)
  md: 22,   // header / overlay icons (back, more, heart, mini-player)
  sm: 18,   // inline list actions (more, download, collection play)
};

export const opacities = {
  full: 1,
  slightlyTransparent: 0.7,
  half: 0.5,
  veryTransparent: 0.3,
  transparent: 0,
};

export const sizes = {
  navbarHeight: 80,
  albumCoverHomeHeight: 140,
};
