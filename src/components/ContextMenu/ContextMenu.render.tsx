import React from 'react';
import { Modal, TouchableOpacity, View, Text, TouchableWithoutFeedback, Dimensions } from 'react-native';
import { styles } from './ContextMenu.style.tsx';
import { ActionItem } from '../../constants/navigation.tsx';

interface ContextMenuProps {
    visible: boolean;
    onClose: () => void;
    options: ActionItem[];
    position: { x: number; y: number };
    params?: any;
    navigation: any;
}

const ContextMenu = ({
    visible,
    onClose,
    options,
    position,
    params,
    navigation,
}: ContextMenuProps) => {
    const { width, height } = Dimensions.get('window');
    const OFFSET = 10;

    let menuStyle: any = {};

    if (position.y < height / 2) {
        menuStyle.top = position.y + OFFSET;
    } else {
        menuStyle.bottom = height - position.y + OFFSET;
    }

    if (position.x < width / 2) {
        menuStyle.left = position.x + OFFSET;
    } else {
        menuStyle.right = width - position.x + OFFSET;
    }

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.modalOverlay}>
                    <View
                        style={[
                            styles.menuContainer,
                            menuStyle,
                        ]}
                    >
                        {options.map((option, index) => {
                            const Icon = option.icon;
                            return (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.menuItem}
                                    onPress={() => {
                                        onClose();
                                        option.onClick(navigation, params);
                                    }}
                                >
                                    <Icon height={20} />
                                    <Text style={styles.menuText}>{option.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

export default ContextMenu;
