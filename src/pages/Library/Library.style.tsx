import { StyleSheet, View, TouchableOpacity, Image, ScrollView } from 'react-native';
import DefaultText from '../../components/DefaultText';
import { colors } from '../../constants/styling.tsx';
import { ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

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
        width: 60,
        height: 60,
        borderRadius: 4,
        marginRight: 15,
    },
    itemInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    itemTitle: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    itemAuthor: {
        color: '#b3b3b3',
        fontSize: 14,
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
    <Image style={styles.itemImage} {...props} />
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
