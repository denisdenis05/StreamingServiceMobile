import { StyleSheet } from 'react-native';
import { colors } from '../../constants/styling.tsx';

export const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    menuContainer: {
        position: 'absolute',
        backgroundColor: colors.secondaryBackground,
        borderRadius: 12,
        padding: 10,
        paddingEnd: 20,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
        minWidth: 150,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 10,
        gap: 10,
    },
    menuText: {
        color: colors.normalText,
        fontSize: 16,
        margin: 0,
        padding: 0,
    },
});
