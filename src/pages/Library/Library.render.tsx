import React from 'react';
import PageContainer from '../../components/PageContainer';
import {
    ContentContainer,
    HeaderContainer,
    HeaderTitle,
    StyledImage,
} from '../Home/Home.style.tsx';
import {
    PLACEHOLDER_PROFILE_PIC,
    PLACEHOLDER_USERNAME,
    PLACEHOLDER_ALBUM_COVER,
} from '../../constants/placeholders.tsx';
import { HOME_HEADER_TEXT } from '../../constants/texts.tsx';
import Navbar from '../../components/Navbar';
import { useApi } from '../../hooks/useApi.ts';
import { useData } from '../../services/DataProvider.tsx';
import {
    LibraryContainer,
    LibraryItemAuthor,
    LibraryItemContainer,
    LibraryItemImage,
    LibraryItemInfo,
    LibraryItemTitle,
} from './Library.style.tsx';
import { Album } from '../../constants/types.tsx';

const Library = ({ navigation, route }: { navigation: any; route: any }) => {
    const api = useApi();
    const fetchLibrary = async () => {
        const res = await api.get('Library');
        return res.data;
    };

    const { data: libraryItems, loading } = useData<Album[]>('library', fetchLibrary);

    const handlePress = (item: any) => {
        if (item.type === 'Playlist') {
            navigation.navigate('PlaylistViewer', {
                playlistId: item.id,
                playlistTitle: item.title,
                playlistOwner: item.artistName,
                playlistCover: item.cover,
                isOwner: item.artistName === PLACEHOLDER_USERNAME // Simplified check, ideally check ID
            });
        } else {
            navigation.navigate('AlbumViewer', {
                albumId: item.id,
                albumTitle: item.title,
                albumArtist: item.artistName,
                albumCover: item.cover,
            });
        }
    };

    return (
        <PageContainer>
            <ContentContainer>
                <HeaderContainer>
                    <StyledImage
                        source={{ uri: PLACEHOLDER_PROFILE_PIC }}
                        navigation={navigation}
                        redirect={'Profile'}
                    />
                    <HeaderTitle>
                        {HOME_HEADER_TEXT}
                        {PLACEHOLDER_USERNAME}
                    </HeaderTitle>
                </HeaderContainer>

                <LibraryContainer>
                    {loading ? (
                        <HeaderTitle>Loading...</HeaderTitle>
                    ) : libraryItems?.map((item: any) => (
                        <LibraryItemContainer key={item.id} onPress={() => handlePress(item)}>
                            <LibraryItemImage source={{ uri: item.cover || PLACEHOLDER_ALBUM_COVER }} />
                            <LibraryItemInfo>
                                <LibraryItemTitle>{item.title}</LibraryItemTitle>
                                <LibraryItemAuthor>{item.artistName}</LibraryItemAuthor>
                            </LibraryItemInfo>
                        </LibraryItemContainer>
                    ))}
                </LibraryContainer>

            </ContentContainer>
            <Navbar navigation={navigation} route={route} />
        </PageContainer>
    );
};

export default Library;
