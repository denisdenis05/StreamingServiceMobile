import { StyleSheet } from 'react-native';
import { colors, typography } from '../../constants/styling.tsx';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';

export const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    menuContainer: {
        position: 'absolute',
        backgroundColor: colors.secondaryBackground,
        borderRadius: moderateScale(12),
        padding: moderateScale(10),
        paddingEnd: scale(20),
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: verticalScale(2),
        },
        shadowOpacity: 0.25,
        shadowRadius: moderateScale(3.84),
        elevation: 5,
        minWidth: scale(150),
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: verticalScale(10),
        paddingHorizontal: scale(10),
        gap: scale(10),
    },
    menuText: {
        color: colors.normalText,
        fontSize: typography.body,
        margin: 0,
        padding: 0,
    },
});
