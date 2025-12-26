import React, { ReactNode } from 'react';
import {
    SafeAreaView,
    StyleSheet,
    TextInput,
    View,
    TouchableOpacity,
    FlatList,
} from 'react-native';
import { colors } from '../../constants/styling.tsx';
import DefaultText from '../../components/DefaultText';
import DefaultButton from '../../components/DefaultButton';
import { moderateScale, scale, verticalScale } from '../../utils/scaling';

interface Props {
    children: ReactNode;
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        display: 'flex',
        alignItems: 'center',
        padding: moderateScale(20),
        gap: verticalScale(20),
        height: '100%',
    },
    dragIndicator: {
        width: scale(40),
        height: verticalScale(4),
        backgroundColor: '#666',
        borderRadius: moderateScale(2),
        alignSelf: 'center',
        marginBottom: verticalScale(20),
    },
    actionTitle: {
        color: colors.normalText,
        margin: 0,
        marginTop: verticalScale(5),
        fontSize: moderateScale(18),
        fontWeight: 'bold',
        textAlignVertical: 'center',
    },
    centeredContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '80%',
        width: '100%',
        gap: '10%',
    },
    styledInput: {
        height: verticalScale(60),
        width: '80%',
        minWidth: scale(250),
        borderColor: colors.lowOpacityText,
        borderWidth: 3,
        borderRadius: moderateScale(8),
        paddingHorizontal: scale(10),
        color: colors.slightlyColoredText,
        fontSize: moderateScale(26),
        fontWeight: 'bold',
        textAlign: 'center',
    },
    button: {
        backgroundColor: 'transparent',
        borderColor: colors.normalText,
        borderWidth: 3,
        borderRadius: moderateScale(8),
        paddingHorizontal: scale(10),
        fontWeight: 'bold',
    },
    playlistItem: {
        padding: moderateScale(15),
        borderBottomWidth: 1,
        borderBottomColor: colors.lowOpacityText,
        width: '100%',
    },
    playlistName: {
        color: colors.normalText,
        fontSize: moderateScale(18),
    },
    listContainer: {
        width: '100%',
        flex: 1,
    },
});

export const BackdropContainer = ({ children }: Props) => {
    return <View style={styles.backdrop}>{children}</View>;
};

export const ContentContainer = ({ children }: Props) => {
    return <SafeAreaView style={styles.content}>{children}</SafeAreaView>;
};

export const DragIndicator = () => {
    return <View style={styles.dragIndicator} />;
};

export const CardTitle = ({ children }: Props) => {
    return <DefaultText style={[styles.actionTitle]}>{children}</DefaultText>;
};

export const CenteredContainer = ({ children }: Props) => {
    return <View style={styles.centeredContainer}>{children}</View>;
};

export const StyledInput = ({
    value,
    onChangeText,
    placeholder,
}: {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
}) => {
    return (
        <TextInput
            style={styles.styledInput}
            placeholder={placeholder || '...'}
            value={value}
            onChangeText={onChangeText}
        />
    );
};

export const StyledButton = ({
    title,
    onPress,
    disabled,
}: {
    title: string;
    onPress: () => void;
    disabled: boolean;
}) => {
    return (
        <DefaultButton
            onPress={onPress}
            title={title}
            style={styles.button}
            disabled={disabled}
        />
    );
};

export const PlaylistItem = ({
    name,
    onPress,
}: {
    name: string;
    onPress: () => void;
}) => {
    return (
        <TouchableOpacity style={styles.playlistItem} onPress={onPress}>
            <DefaultText style={styles.playlistName}>{name}</DefaultText>
        </TouchableOpacity>
    );
};

export const ListContainer = ({ children }: Props) => {
    return <View style={styles.listContainer}>{children}</View>;
};
