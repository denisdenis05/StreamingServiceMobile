import { StyleSheet } from 'react-native';
import { colors, typography } from '../../constants/styling';

const Layout = Object.freeze({ pageInset: 20, itemGap: 12, sectionInset: 16, sectionRadius: 14,
  inputInset: 12, inputRadius: 8, borderWidth: 1, bottomInset: 48, headingMargin: 4,
  fullWidth: '100%', headingWeight: '700',
  horizontalDirection: 'row', wrapRows: 'wrap', inputAlignment: 'top' } as const);

export const spotifyJamStyles = StyleSheet.create({
  page: { width: Layout.fullWidth, flex: 1 },
  content: { padding: Layout.pageInset, paddingBottom: Layout.bottomInset, gap: Layout.itemGap },
  heading: { fontSize: typography.pageTitle, fontWeight: Layout.headingWeight, marginBottom: Layout.headingMargin },
  sectionTitle: { fontSize: typography.sectionTitle, fontWeight: Layout.headingWeight },
  section: { backgroundColor: colors.secondaryBackground, borderRadius: Layout.sectionRadius,
    padding: Layout.sectionInset, gap: Layout.itemGap },
  input: { color: colors.normalText, backgroundColor: colors.background, borderColor: colors.slightlyTransparentText,
    borderWidth: Layout.borderWidth, borderRadius: Layout.inputRadius, padding: Layout.inputInset, fontSize: typography.inputText,
    textAlignVertical: Layout.inputAlignment },
  explanation: { color: colors.slightlyTransparentText, fontSize: typography.secondary },
  error: { color: colors.accentPrimary, fontSize: typography.body },
  row: { flexDirection: Layout.horizontalDirection, flexWrap: Layout.wrapRows, gap: Layout.itemGap },
  neutral: { backgroundColor: colors.slightlyColoredText },
  selected: { borderWidth: Layout.borderWidth, borderColor: colors.accentPrimary },
});
