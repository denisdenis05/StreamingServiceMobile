import CachedImage from '../../components/CachedImage';
import { StyleSheet, View, TouchableOpacity, ScrollView } from 'react-native';
import DefaultText from '../../components/DefaultText';
import { colors, typography } from '../../constants/styling.tsx';
import { moderateScale } from '../../utils/scaling';
import { ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

export const libraryItemImageSize = moderateScale(60);
export const libraryItemImageRadius = moderateScale(4);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    itemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        marginBottom: 10,
    },
    itemImage: {
        width: libraryItemImageSize,
        height: libraryItemImageSize,
        borderRadius: libraryItemImageRadius,
        marginRight: 15,
    },
    itemInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    itemTitle: {
        color: colors.normalText,
        fontSize: typography.itemTitle,
        fontWeight: '600',
        marginBottom: 4,
    },
    itemAuthor: {
        color: colors.slightlyTransparentText,
        fontSize: typography.secondary,
    },
});

export const LibraryContainer = ({ children }: Props) => (
    <ScrollView style={styles.container}>{children}</ScrollView>
);

export const LibraryItemContainer = ({ children, onPress }: any) => (
    <TouchableOpacity style={styles.itemContainer} onPress={onPress}>
        {children}
    </TouchableOpacity>
);

export const LibraryItemImage = (props: any) => (
    <CachedImage style={styles.itemImage} {...props} />
);

export const LibraryItemInfo = ({ children }: Props) => (
    <View style={styles.itemInfo}>{children}</View>
);

export const LibraryItemTitle = ({ children }: Props) => (
    <DefaultText style={styles.itemTitle}>{children}</DefaultText>
);

export const LibraryItemAuthor = ({ children }: Props) => (
    <DefaultText style={styles.itemAuthor}>{children}</DefaultText>
);
